
import { describe, expect, test } from 'bun:test';
import { Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import {
  type BlockSelection,
  computeSelectionApply,
  deriveAncestorChain,
  deriveBlockSelection,
  isBlockNavigationKey,
  type PluginRuntime,
  SELECTION_ORIGIN_META_KEY,
  selectionStatePluginKey,
} from './selection-state-plugin.ts';


const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    jsxComponent: {
      group: 'block',
      content: 'block*',
      attrs: {
        componentName: { default: 'Unknown' },
      },
      selectable: true,
    },
    text: { group: 'inline' },
  },
  marks: {},
});

const EMPTY: BlockSelection = {
  selectedBlockId: null,
  ancestorChain: [],
  selectionOrigin: 'programmatic',
  isDragging: false,
};

function makeStubPlugin() {
  return new Plugin<BlockSelection>({
    key: selectionStatePluginKey,
    state: {
      init: (_c, s) => deriveBlockSelection(s, EMPTY),
      apply: (tr, prev, _o, newState) => {
        const metaOrigin = tr.getMeta(SELECTION_ORIGIN_META_KEY);
        return deriveBlockSelection(newState, prev, {
          origin: metaOrigin ?? prev.selectionOrigin,
        });
      },
    },
  });
}

function makeStateFromDoc(doc: ReturnType<Schema['node']>) {
  return EditorState.create({ doc, plugins: [makeStubPlugin()] });
}


const p = (text = ''): ReturnType<Schema['node']> =>
  text ? schema.node('paragraph', null, [schema.text(text)]) : schema.node('paragraph');

const jsx = (
  componentName: string,
  children: ReturnType<Schema['node']>[] = [],
): ReturnType<Schema['node']> => schema.node('jsxComponent', { componentName }, children);


describe('deriveAncestorChain', () => {
  test('returns empty chain when selection is outside any jsxComponent', () => {
    const doc = schema.node('doc', null, [p('hello')]);
    const state = makeStateFromDoc(doc);
    const chain = deriveAncestorChain(
      state,
      TextSelection.create(doc, 1), // cursor in paragraph
    );
    expect(chain).toEqual([]);
  });

  test('returns single entry for NodeSelection on top-level jsxComponent', () => {
    const card = jsx('Card', [p('body')]);
    const doc = schema.node('doc', null, [card]);
    const state = makeStateFromDoc(doc);
    const chain = deriveAncestorChain(state, NodeSelection.create(doc, 0));
    expect(chain).toHaveLength(1);
    expect(chain[0].componentName).toBe('Card');
    expect(chain[0].pos).toBe(0);
    expect(chain[0].bridgeId).toMatch(/^pos-0$|^b\d+$/); // fallback or real bridgeId
  });

  test('returns two-entry chain for nested Card-in-Cards NodeSelection on inner', () => {
    const inner = jsx('Card', [p('inner')]);
    const outer = jsx('Cards', [inner]);
    const doc = schema.node('doc', null, [outer]);
    const state = makeStateFromDoc(doc);
    const chain = deriveAncestorChain(state, NodeSelection.create(doc, 1));
    expect(chain).toHaveLength(2);
    expect(chain[0].componentName).toBe('Cards');
    expect(chain[1].componentName).toBe('Card');
  });

  test('TextSelection inside a jsxComponent maps to that component as innermost', () => {
    const card = jsx('Card', [p('hello')]);
    const doc = schema.node('doc', null, [card]);
    const state = makeStateFromDoc(doc);
    const chain = deriveAncestorChain(state, TextSelection.create(doc, 3));
    expect(chain).toHaveLength(1);
    expect(chain[0].componentName).toBe('Card');
  });

  test('deeply nested chain preserves outer→inner order', () => {
    const step = jsx('Step', [p('s')]);
    const steps = jsx('Steps', [step]);
    const card = jsx('Card', [steps]);
    const cards = jsx('Cards', [card]);
    const doc = schema.node('doc', null, [cards]);
    const state = makeStateFromDoc(doc);
    const chain = deriveAncestorChain(state, NodeSelection.create(doc, 3));
    expect(chain.map((e) => e.componentName)).toEqual(['Cards', 'Card', 'Steps', 'Step']);
  });
});

describe('deriveBlockSelection', () => {
  test('initial state: empty chain, null selectedBlockId', () => {
    const doc = schema.node('doc', null, [p('hello')]);
    const state = makeStateFromDoc(doc);
    const sel = deriveBlockSelection(state, EMPTY);
    expect(sel.selectedBlockId).toBeNull();
    expect(sel.ancestorChain).toEqual([]);
  });

  test('NodeSelection on jsxComponent populates selectedBlockId', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    let state = makeStateFromDoc(doc);
    const tr = state.tr.setSelection(NodeSelection.create(doc, 0));
    state = state.apply(tr);
    const sel = selectionStatePluginKey.getState(state);
    expect(sel?.selectedBlockId).not.toBeNull();
    expect(sel?.ancestorChain).toHaveLength(1);
    expect(sel?.ancestorChain[0].componentName).toBe('Card');
  });

  test('nested selection: selectedBlockId is innermost', () => {
    const inner = jsx('Card');
    const outer = jsx('Cards', [inner]);
    const doc = schema.node('doc', null, [outer]);
    let state = makeStateFromDoc(doc);
    state = state.apply(state.tr.setSelection(NodeSelection.create(doc, 1)));
    const sel = selectionStatePluginKey.getState(state);
    expect(sel?.ancestorChain).toHaveLength(2);
    expect(sel?.ancestorChain[1].componentName).toBe('Card');
    expect(sel?.selectedBlockId).toBe(sel?.ancestorChain[1].bridgeId);
  });

  test('selection moving off a jsxComponent clears selectedBlockId', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('a')]), p('b')]);
    let state = makeStateFromDoc(doc);
    state = state.apply(state.tr.setSelection(NodeSelection.create(doc, 0)));
    expect(selectionStatePluginKey.getState(state)?.selectedBlockId).not.toBeNull();
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));
    const sel = selectionStatePluginKey.getState(state);
    expect(sel?.selectedBlockId).toBeNull();
    expect(sel?.ancestorChain).toEqual([]);
  });

  test('reference preservation: identical derived state returns prev', () => {
    const doc = schema.node('doc', null, [p('hello')]);
    const state = makeStateFromDoc(doc);
    const sel1 = deriveBlockSelection(state, EMPTY);
    const sel2 = deriveBlockSelection(state, sel1);
    expect(sel2).toBe(sel1); // reference equal — critical for useSyncExternalStore
  });

  test('SELECTION_ORIGIN_META_KEY overrides origin', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    let state = makeStateFromDoc(doc);
    const tr = state.tr
      .setSelection(NodeSelection.create(doc, 0))
      .setMeta(SELECTION_ORIGIN_META_KEY, 'programmatic');
    state = state.apply(tr);
    const sel = selectionStatePluginKey.getState(state);
    expect(sel?.selectionOrigin).toBe('programmatic');
  });

  test('ancestorChain entries carry pos matching selection', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    const state = makeStateFromDoc(doc);
    const chain = deriveAncestorChain(state, NodeSelection.create(doc, 0));
    expect(chain[0].pos).toBe(0);
  });
});

describe('computeSelectionApply (real plugin apply path)', () => {

  const seed = (origin: BlockSelection['selectionOrigin']): BlockSelection => ({
    ...EMPTY,
    selectionOrigin: origin,
  });

  test('pending pointer origin lands on the next selection-change tx', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    const state = makeStateFromDoc(doc);
    const runtime: PluginRuntime = { pendingOrigin: 'pointer', isDragging: false };
    const tr = state.tr.setSelection(NodeSelection.create(doc, 0));
    const next = computeSelectionApply(tr, EMPTY, state.apply(tr), runtime);
    expect(next.selectionOrigin).toBe('pointer');
    expect(runtime.pendingOrigin).toBeNull();
  });

  test('pending origin is NOT consumed by a tx that does not change selection', () => {
    const doc = schema.node('doc', null, [p('hi')]);
    const state = makeStateFromDoc(doc);
    const runtime: PluginRuntime = { pendingOrigin: 'pointer', isDragging: false };
    const noopTr = state.tr.setMeta('foreign', true); // no selection change
    const after = computeSelectionApply(noopTr, EMPTY, state.apply(noopTr), runtime);
    expect(after.selectionOrigin).toBe('programmatic');
    expect(runtime.pendingOrigin).toBe('pointer');
  });

  test('refresh-tagged tx does NOT consume pending origin even if selectionSet', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    const state = makeStateFromDoc(doc);
    const runtime: PluginRuntime = { pendingOrigin: 'keyboard', isDragging: false };
    const refreshTr = state.tr
      .setSelection(NodeSelection.create(doc, 0))
      .setMeta('selectionStatePlugin/refresh', true);
    const after = computeSelectionApply(refreshTr, EMPTY, state.apply(refreshTr), runtime);
    expect(runtime.pendingOrigin).toBe('keyboard');
    expect(after.selectionOrigin).toBe('programmatic');
  });

  test('SELECTION_ORIGIN_META_KEY (meta) overrides pending origin', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    const state = makeStateFromDoc(doc);
    const runtime: PluginRuntime = { pendingOrigin: 'pointer', isDragging: false };
    const tr = state.tr
      .setSelection(NodeSelection.create(doc, 0))
      .setMeta(SELECTION_ORIGIN_META_KEY, 'programmatic');
    const after = computeSelectionApply(tr, EMPTY, state.apply(tr), runtime);
    expect(after.selectionOrigin).toBe('programmatic');
    expect(runtime.pendingOrigin).toBeNull();
  });

  test('keyboard pendingOrigin produces selectionOrigin=keyboard', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    const state = makeStateFromDoc(doc);
    const runtime: PluginRuntime = { pendingOrigin: 'keyboard', isDragging: false };
    const tr = state.tr.setSelection(NodeSelection.create(doc, 0));
    const after = computeSelectionApply(tr, EMPTY, state.apply(tr), runtime);
    expect(after.selectionOrigin).toBe('keyboard');
  });

  test('isDragging propagates from runtime to next state', () => {
    const doc = schema.node('doc', null, [p('hi')]);
    const state = makeStateFromDoc(doc);
    const runtime: PluginRuntime = { pendingOrigin: null, isDragging: true };
    const tr = state.tr.setMeta('selectionStatePlugin/refresh', true);
    const after = computeSelectionApply(tr, EMPTY, state.apply(tr), runtime);
    expect(after.isDragging).toBe(true);
  });

  test('runtime undefined falls back to prev (no crash)', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    const state = makeStateFromDoc(doc);
    const tr = state.tr.setSelection(NodeSelection.create(doc, 0));
    const prev = seed('keyboard');
    const after = computeSelectionApply(tr, prev, state.apply(tr), undefined);
    expect(after.selectionOrigin).toBe('keyboard');
    expect(after.isDragging).toBe(false);
  });
});

describe('BlockSelection shape invariants', () => {
  test('selectedBlockId matches ancestorChain[last].bridgeId when non-null', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    let state = makeStateFromDoc(doc);
    state = state.apply(state.tr.setSelection(NodeSelection.create(doc, 0)));
    const sel = selectionStatePluginKey.getState(state);
    expect(sel?.selectedBlockId).not.toBeNull();
    expect(sel?.selectedBlockId).toBe(sel?.ancestorChain[sel.ancestorChain.length - 1].bridgeId);
  });

  test('selectedBlockId is null iff ancestorChain is empty', () => {
    const doc = schema.node('doc', null, [p('hi')]);
    const state = makeStateFromDoc(doc);
    const sel = selectionStatePluginKey.getState(state);
    expect(sel?.selectedBlockId).toBeNull();
    expect(sel?.ancestorChain).toEqual([]);
  });

  test('isDragging defaults to false on init', () => {
    const doc = schema.node('doc', null, [p('hi')]);
    const state = makeStateFromDoc(doc);
    const sel = selectionStatePluginKey.getState(state);
    expect(sel?.isDragging).toBe(false);
  });
});

describe('isBlockNavigationKey', () => {
  test.each([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Tab',
    'Escape',
    'Enter',
    'Home',
    'End',
    'PageUp',
    'PageDown',
  ])('returns true for navigation key %s', (key) => {
    expect(isBlockNavigationKey(key)).toBe(true);
  });

  test.each([
    'a',
    '1',
    ' ',
    'Shift',
    'Control',
    'Meta',
    'F1',
    '',
  ])('returns false for non-navigation key %p', (key) => {
    expect(isBlockNavigationKey(key)).toBe(false);
  });
});
