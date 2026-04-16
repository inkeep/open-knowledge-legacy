/**
 * SelectionAnnouncer unit tests — cover `formatSelectionMessage` (pure
 * formatter) and the wildcard / index-in-parent branch matrix.
 *
 * The full component (debounce, imperative textContent write, two-step
 * clear-then-write for identical-message re-announce) is exercised by the
 * E2E harness (US-011 scenario S8); these unit tests cover the AT-facing
 * message shape the E2E harness only asserts partially.
 */

import { describe, expect, test } from 'bun:test';
import { Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection } from '@tiptap/pm/state';
import type { BlockSelection } from '../../editor/extensions/selection-state-plugin.ts';
import { formatSelectionMessage } from './SelectionAnnouncer.tsx';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    jsxComponent: {
      group: 'block',
      content: 'block*',
      attrs: { componentName: { default: 'Unknown' } },
      selectable: true,
    },
    text: { group: 'inline' },
  },
  marks: {},
});

const p = (text = ''): ReturnType<Schema['node']> =>
  text ? schema.node('paragraph', null, [schema.text(text)]) : schema.node('paragraph');
const jsx = (
  componentName: string,
  children: ReturnType<Schema['node']>[] = [],
): ReturnType<Schema['node']> => schema.node('jsxComponent', { componentName }, children);

/** Minimal Editor stub satisfying the surface formatSelectionMessage reads. */
function makeEditor(doc: ReturnType<Schema['node']>) {
  const state = EditorState.create({
    doc,
    selection: NodeSelection.create(doc, 0),
  });
  // biome-ignore lint/suspicious/noExplicitAny: formatSelectionMessage only touches editor.state.doc.resolve
  return { state } as any;
}

describe('formatSelectionMessage', () => {
  test('returns empty string when blockSelection is null', () => {
    const editor = makeEditor(schema.node('doc', null, [p('hi')]));
    expect(formatSelectionMessage(editor, null)).toBe('');
  });

  test('returns empty string when ancestorChain is empty', () => {
    const editor = makeEditor(schema.node('doc', null, [p('hi')]));
    const sel: BlockSelection = {
      selectedBlockId: null,
      ancestorChain: [],
      selectionOrigin: 'programmatic',
      isDragging: false,
    };
    expect(formatSelectionMessage(editor, sel)).toBe('');
  });

  test('single-entry chain uses the registered descriptor label', () => {
    // Callout is a registered built-in descriptor with displayName 'Callout'.
    const editor = makeEditor(schema.node('doc', null, [jsx('Callout', [p('note')])]));
    const sel: BlockSelection = {
      selectedBlockId: 'b1',
      ancestorChain: [{ bridgeId: 'b1', componentName: 'Callout', pos: 0 }],
      selectionOrigin: 'pointer',
      isDragging: false,
    };
    const msg = formatSelectionMessage(editor, sel);
    expect(msg).toStartWith('Selected: ');
    expect(msg).toContain('Callout');
  });

  test('unregistered component surfaces componentName + "(unregistered)"', () => {
    const editor = makeEditor(schema.node('doc', null, [jsx('FooBar', [p('x')])]));
    const sel: BlockSelection = {
      selectedBlockId: 'b1',
      ancestorChain: [{ bridgeId: 'b1', componentName: 'FooBar', pos: 0 }],
      selectionOrigin: 'pointer',
      isDragging: false,
    };
    const msg = formatSelectionMessage(editor, sel);
    expect(msg).toBe('Selected: FooBar (unregistered)');
    expect(msg).not.toContain('*');
  });

  test('nested chain formats "N of M in Parent"', () => {
    // Cards container at pos 0; three Card children; select second Card.
    const cards = jsx('Cards', [jsx('Card'), jsx('Card'), jsx('Card')]);
    const doc = schema.node('doc', null, [cards]);
    // Second Card pos = 1 (inside cards) + first Card nodeSize (2) = 3.
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 3) });
    // biome-ignore lint/suspicious/noExplicitAny: formatSelectionMessage only touches editor.state.doc.resolve
    const editor = { state } as any;
    const sel: BlockSelection = {
      selectedBlockId: 'card-b2',
      ancestorChain: [
        { bridgeId: 'cards-b1', componentName: 'Cards', pos: 0 },
        { bridgeId: 'card-b2', componentName: 'Card', pos: 3 },
      ],
      selectionOrigin: 'pointer',
      isDragging: false,
    };
    const msg = formatSelectionMessage(editor, sel);
    // Index within parent is 0-based, announced 1-based.
    expect(msg).toBe('Selected: Card, 2 of 3 in Cards');
  });

  test('nested chain with unresolvable pos falls back to no-index form', () => {
    const cards = jsx('Cards', [jsx('Card')]);
    const doc = schema.node('doc', null, [cards]);
    const state = EditorState.create({ doc });
    // biome-ignore lint/suspicious/noExplicitAny: formatSelectionMessage only touches editor.state.doc.resolve
    const editor = { state } as any;
    const sel: BlockSelection = {
      selectedBlockId: 'card-b2',
      ancestorChain: [
        { bridgeId: 'cards-b1', componentName: 'Cards', pos: 0 },
        // Pos 99999 is past end of doc — resolve() throws.
        { bridgeId: 'card-b2', componentName: 'Card', pos: 99999 },
      ],
      selectionOrigin: 'pointer',
      isDragging: false,
    };
    const msg = formatSelectionMessage(editor, sel);
    expect(msg).toBe('Selected: Card in Cards');
  });

  test('nested chain with unregistered innermost still identifies the component', () => {
    const cards = jsx('Cards', [jsx('FooBar')]);
    const doc = schema.node('doc', null, [cards]);
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 1) });
    // biome-ignore lint/suspicious/noExplicitAny: formatSelectionMessage only touches editor.state.doc.resolve
    const editor = { state } as any;
    const sel: BlockSelection = {
      selectedBlockId: 'foobar-b2',
      ancestorChain: [
        { bridgeId: 'cards-b1', componentName: 'Cards', pos: 0 },
        { bridgeId: 'foobar-b2', componentName: 'FooBar', pos: 1 },
      ],
      selectionOrigin: 'pointer',
      isDragging: false,
    };
    const msg = formatSelectionMessage(editor, sel);
    expect(msg).toContain('FooBar (unregistered)');
    expect(msg).toContain('in Cards');
  });
});
