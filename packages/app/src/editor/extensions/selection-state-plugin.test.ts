/**
 * SelectionStatePlugin unit tests — pure PM EditorState (no DOM/TipTap wiring).
 *
 * Covers `deriveAncestorChain` + `deriveBlockSelection` behavior in isolation.
 * DOM event classification (mousedown → 'pointer', keydown → 'keyboard') lives
 * in `props.handleDOMEvents` / `handleKeyDown` and is exercised by the E2E
 * suite (US-010); the origin-override path via `SELECTION_ORIGIN_META_KEY`
 * is testable here because it's tr-meta-based.
 */

import { describe, expect, test } from 'bun:test';
import { Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection, Plugin, TextSelection } from '@tiptap/pm/state';
import {
  type BlockSelection,
  computeSelectionApply,
  deriveAncestorChain,
  deriveBlockSelection,
  type PluginRuntime,
  SELECTION_ORIGIN_META_KEY,
  selectionStatePluginKey,
} from './selection-state-plugin.ts';

// ── Minimal schema mirroring jsxComponent shape ──────────────────────────
// jsxComponent is a block node with content 'block*', the same content
// expression the core schema uses (packages/core/src/extensions/jsx-component.ts).
// We add an attr `componentName` to mirror the real attrs the plugin reads.

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
      // Needs to be selectable so NodeSelection works.
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

/** Plugin stub that mirrors the real plugin's state shape so we can run
 *  `EditorState.create({plugins: [stub]})` and walk `apply` semantics. We
 *  can't use the real plugin here because it pulls in TipTap's Extension
 *  machinery. `deriveBlockSelection` is the testable unit. */
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

// ── Doc builders (ergonomics) ────────────────────────────────────────────

const p = (text = ''): ReturnType<Schema['node']> =>
  text ? schema.node('paragraph', null, [schema.text(text)]) : schema.node('paragraph');

const jsx = (
  componentName: string,
  children: ReturnType<Schema['node']>[] = [],
): ReturnType<Schema['node']> => schema.node('jsxComponent', { componentName }, children);

// ── Tests ────────────────────────────────────────────────────────────────

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
    // The inner Card sits at position 1 (inside outer which starts at 0).
    const chain = deriveAncestorChain(state, NodeSelection.create(doc, 1));
    expect(chain).toHaveLength(2);
    expect(chain[0].componentName).toBe('Cards');
    expect(chain[1].componentName).toBe('Card');
  });

  test('TextSelection inside a jsxComponent maps to that component as innermost', () => {
    const card = jsx('Card', [p('hello')]);
    const doc = schema.node('doc', null, [card]);
    const state = makeStateFromDoc(doc);
    // Cursor inside the paragraph text inside the Card.
    // Positions: <doc 0><card 1><p 2>h e l l o</p><card/></doc>
    //   card opens at 0, p opens at 1, text starts at 2.
    const chain = deriveAncestorChain(state, TextSelection.create(doc, 3));
    expect(chain).toHaveLength(1);
    expect(chain[0].componentName).toBe('Card');
  });

  test('deeply nested chain preserves outer→inner order', () => {
    // <Cards><Card><Steps><Step><p/></Step></Steps></Card></Cards>
    const step = jsx('Step', [p('s')]);
    const steps = jsx('Steps', [step]);
    const card = jsx('Card', [steps]);
    const cards = jsx('Cards', [card]);
    const doc = schema.node('doc', null, [cards]);
    const state = makeStateFromDoc(doc);
    // NodeSelection on innermost Step — pos should be cards(0) + card(1) + steps(1) + 1 = 3
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
    // inner Card at pos 1
    state = state.apply(state.tr.setSelection(NodeSelection.create(doc, 1)));
    const sel = selectionStatePluginKey.getState(state);
    expect(sel?.ancestorChain).toHaveLength(2);
    expect(sel?.ancestorChain[1].componentName).toBe('Card');
    expect(sel?.selectedBlockId).toBe(sel?.ancestorChain[1].bridgeId);
  });

  test('selection moving off a jsxComponent clears selectedBlockId', () => {
    const doc = schema.node('doc', null, [jsx('Card', [p('a')]), p('b')]);
    let state = makeStateFromDoc(doc);
    // Select the Card.
    state = state.apply(state.tr.setSelection(NodeSelection.create(doc, 0)));
    expect(selectionStatePluginKey.getState(state)?.selectedBlockId).not.toBeNull();
    // Move selection into the bare paragraph (outside any jsxComponent).
    // Card nodeSize = 1 (open) + 1 (para open) + 1 (char) + 1 (para close) + 1 (close) = 5.
    // Paragraph 'b' starts at pos 5, text at 6.
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
  // These tests exercise the real apply pure helper that the production
  // plugin wires up — covering the precedence chain (meta > pending > prev),
  // the consume-on-selection-change semantics, and the refresh-tx exemption.

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
    // pendingOrigin consumed.
    expect(runtime.pendingOrigin).toBeNull();
  });

  test('pending origin is NOT consumed by a tx that does not change selection', () => {
    // Race scenario: user clicks → pendingOrigin='pointer'. Before the
    // user's selection-changing tx arrives, a foreign tx (e.g. y-prosemirror
    // remote sync or a meta-only tx) runs apply. The plugin must NOT
    // consume the pending origin — otherwise the user's actual selection
    // change inherits prev (stale) instead of 'pointer'.
    const doc = schema.node('doc', null, [p('hi')]);
    const state = makeStateFromDoc(doc);
    const runtime: PluginRuntime = { pendingOrigin: 'pointer', isDragging: false };
    const noopTr = state.tr.setMeta('foreign', true); // no selection change
    const after = computeSelectionApply(noopTr, EMPTY, state.apply(noopTr), runtime);
    // Origin not advanced (prev remains); pending preserved for next tx.
    expect(after.selectionOrigin).toBe('programmatic');
    expect(runtime.pendingOrigin).toBe('pointer');
  });

  test('refresh-tagged tx does NOT consume pending origin even if selectionSet', () => {
    // Defense in depth: even if a refresh tx happens to set a selection
    // somehow, the explicit refresh tag exempts it from consumption.
    const doc = schema.node('doc', null, [jsx('Card', [p('x')])]);
    const state = makeStateFromDoc(doc);
    const runtime: PluginRuntime = { pendingOrigin: 'keyboard', isDragging: false };
    const refreshTr = state.tr
      .setSelection(NodeSelection.create(doc, 0))
      .setMeta('selectionStatePlugin/refresh', true);
    const after = computeSelectionApply(refreshTr, EMPTY, state.apply(refreshTr), runtime);
    // Refresh tx did not consume pending — pending still 'keyboard'.
    expect(runtime.pendingOrigin).toBe('keyboard');
    // Origin falls through to prev because pending wasn't consumed.
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
    // Meta wins; pending still consumed (selectionSet=true).
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
    // If the runtime WeakMap entry was somehow GC'd or missing, the apply
    // must not crash; falls back to prev for both origin and isDragging.
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
