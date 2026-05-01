import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { EditorState, type Plugin, type Transaction } from '@tiptap/pm/state';
import { ySyncPluginKey } from 'y-prosemirror';
import { sharedExtensions } from './shared';
import { SourceDirtyObserver, sourceDirtyPluginKey } from './source-dirty-observer';

const schema = getSchema(sharedExtensions);

function getPlugin(): Plugin {
  const ext = SourceDirtyObserver.configure({});
  const pluginsFn = (ext.config as { addProseMirrorPlugins?: () => Plugin[] })
    .addProseMirrorPlugins;
  if (!pluginsFn) throw new Error('SourceDirtyObserver missing addProseMirrorPlugins');
  const plugins = pluginsFn.call({} as never);
  if (plugins.length === 0) throw new Error('SourceDirtyObserver returned no plugins');
  return plugins[0];
}

function buildInitialState(plugin: Plugin): EditorState {
  const doc = schema.node('doc', null, [
    schema.node(
      'jsxComponent',
      {
        content: '',
        componentName: 'Callout',
        kind: 'element',
        attributes: [],
        sourceRaw: '<Callout title="A">\n\nA body\n\n</Callout>',
        sourceDirty: false,
        props: { title: 'A' },
      },
      [schema.node('paragraph', null, [schema.text('A body')])],
    ),
    schema.node(
      'jsxComponent',
      {
        content: '',
        componentName: 'Callout',
        kind: 'element',
        attributes: [],
        sourceRaw: '<Callout title="B">\n\nB body\n\n</Callout>',
        sourceDirty: false,
        props: { title: 'B' },
      },
      [schema.node('paragraph', null, [schema.text('B body')])],
    ),
  ]);

  return EditorState.create({ schema, doc, plugins: [plugin] });
}

function firstComponentPos(state: EditorState): number {
  let pos = -1;
  state.doc.descendants((node, p) => {
    if (pos !== -1) return false;
    if (node.type.name === 'jsxComponent') pos = p;
  });
  if (pos === -1) throw new Error('No jsxComponent in doc');
  return pos;
}

function isDirty(state: EditorState, pos: number): boolean {
  const node = state.doc.nodeAt(pos);
  if (!node) throw new Error(`No node at pos ${pos}`);
  return Boolean(node.attrs.sourceDirty);
}

function applyWithAppend(
  plugin: Plugin,
  state: EditorState,
  mutate: (tr: Transaction) => Transaction,
): EditorState {
  const userTr = mutate(state.tr);
  const intermediate = state.apply(userTr);
  const spec = plugin.spec as { appendTransaction?: typeof plugin.spec.appendTransaction };
  const appended = spec.appendTransaction?.([userTr], state, intermediate);
  if (!appended) return intermediate;
  return intermediate.apply(appended);
}

describe('SourceDirtyObserver origin guard', () => {
  test('user-intent prop edit marks only the mutated jsxComponent dirty', () => {
    const plugin = getPlugin();
    const initial = buildInitialState(plugin);
    const targetPos = firstComponentPos(initial);
    const secondPos = targetPos + (initial.doc.nodeAt(targetPos)?.nodeSize ?? 0);

    expect(isDirty(initial, targetPos)).toBe(false);
    expect(isDirty(initial, secondPos)).toBe(false);

    const next = applyWithAppend(plugin, initial, (tr) => {
      const node = initial.doc.nodeAt(targetPos);
      if (!node) throw new Error('Target vanished');
      return tr.setNodeMarkup(targetPos, null, { ...node.attrs, props: { title: 'A-new' } });
    });

    expect(isDirty(next, targetPos)).toBe(true); // mutated → dirty
    expect(isDirty(next, secondPos)).toBe(false);
  });

  test('CRDT-origin transaction with ySyncPluginKey meta does NOT mark dirty', () => {
    const plugin = getPlugin();
    const initial = buildInitialState(plugin);
    const targetPos = firstComponentPos(initial);

    const next = applyWithAppend(plugin, initial, (tr) => {
      const node = initial.doc.nodeAt(targetPos);
      if (!node) throw new Error('Target vanished');
      tr.setMeta(ySyncPluginKey, { isChangeOrigin: true });
      return tr.setNodeMarkup(targetPos, null, { ...node.attrs, props: { title: 'A-crdt' } });
    });

    const nodeAfter = next.doc.nodeAt(targetPos);
    expect(nodeAfter?.attrs.props).toEqual({ title: 'A-crdt' });
    expect(isDirty(next, targetPos)).toBe(false);
  });

  test('meta truthiness — any non-nullish ySyncPluginKey meta short-circuits', () => {
    const plugin = getPlugin();
    const initial = buildInitialState(plugin);
    const targetPos = firstComponentPos(initial);

    for (const stamp of [
      { isChangeOrigin: true },
      { isUndoRedoOperation: true },
      { other: 'payload' },
      true,
      1,
    ]) {
      const next = applyWithAppend(plugin, initial, (tr) => {
        const node = initial.doc.nodeAt(targetPos);
        if (!node) throw new Error('Target vanished');
        tr.setMeta(ySyncPluginKey, stamp);
        return tr.setNodeMarkup(targetPos, null, { ...node.attrs, props: { title: 'x' } });
      });
      expect(isDirty(next, targetPos)).toBe(false);
    }
  });

  test('sourceDirtyPluginKey is exported and locatable on the EditorState', () => {
    const plugin = getPlugin();
    const initial = buildInitialState(plugin);
    const located = sourceDirtyPluginKey.get(initial);
    expect(located).toBe(plugin);
  });

  test('insertion of a new non-CRDT jsxComponent marks only the insertion dirty', () => {
    const plugin = getPlugin();
    const initial = buildInitialState(plugin);
    const targetPos = firstComponentPos(initial);

    const next = applyWithAppend(plugin, initial, (tr) => {
      const node = schema.node(
        'jsxComponent',
        {
          content: '',
          componentName: 'Callout',
          kind: 'element',
          attributes: [],
          sourceRaw: '',
          sourceDirty: false,
          props: { title: 'NEW' },
        },
        [schema.node('paragraph', null, [schema.text('new body')])],
      );
      return tr.insert(0, node);
    });

    expect(isDirty(next, 0)).toBe(true);
    const shifted = targetPos + (next.doc.firstChild?.nodeSize ?? 0);
    expect(isDirty(next, shifted)).toBe(false);
  });

  test('fresh-insert with authoritative sourceRaw stays pristine (I12 guard positive path)', () => {
    const plugin = getPlugin();
    const initial = buildInitialState(plugin);
    const insertPos = initial.doc.content.size;

    const next = applyWithAppend(plugin, initial, (tr) => {
      const node = schema.node(
        'jsxComponent',
        {
          content: '',
          componentName: 'Callout',
          kind: 'element',
          attributes: [],
          sourceRaw: '<Callout type="info">\ntext\n</Callout>',
          sourceDirty: false,
          props: { type: 'info' },
        },
        [schema.node('paragraph', null, [schema.text('text')])],
      );
      return tr.insert(insertPos, node);
    });

    expect(isDirty(next, insertPos)).toBe(false);
  });
});
