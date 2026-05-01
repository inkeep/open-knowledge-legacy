import { describe, expect, test } from 'bun:test';
import type { Editor } from '@tiptap/core';
import { Schema } from '@tiptap/pm/model';
import { EditorState, Plugin } from '@tiptap/pm/state';
import { bridgeIdPluginKey } from '../../editor/extensions/bridge-id-plugin.ts';
import type { BlockChainEntry } from '../../editor/extensions/selection-state-plugin.ts';
import { computeVisibleEntries, resolveLivePos } from './Breadcrumb.tsx';

function entry(n: number): BlockChainEntry {
  return {
    bridgeId: `b${n}`,
    componentName: `Comp${n}`,
    pos: n * 10,
  };
}

describe('computeVisibleEntries', () => {
  test('empty chain → empty result', () => {
    expect(computeVisibleEntries([])).toEqual([]);
  });

  test('1 entry → passthrough (1 entry, no ellipsis)', () => {
    const out = computeVisibleEntries([entry(1)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ kind: 'entry', entry: entry(1) });
  });

  test('3 entries (below limit) → passthrough', () => {
    const chain = [entry(1), entry(2), entry(3)];
    const out = computeVisibleEntries(chain);
    expect(out).toHaveLength(3);
    expect(out.every((v) => v.kind === 'entry')).toBe(true);
    expect(out.map((v) => (v.kind === 'entry' ? v.entry.bridgeId : ''))).toEqual([
      'b1',
      'b2',
      'b3',
    ]);
  });

  test('4 entries (at limit boundary) → passthrough (no ellipsis)', () => {
    const chain = [entry(1), entry(2), entry(3), entry(4)];
    const out = computeVisibleEntries(chain);
    expect(out).toHaveLength(4);
    expect(out.every((v) => v.kind === 'entry')).toBe(true);
  });

  test('5 entries (just over limit) → [head, ellipsis(2), tail×2]', () => {
    const chain = [entry(1), entry(2), entry(3), entry(4), entry(5)];
    const out = computeVisibleEntries(chain);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ kind: 'entry', entry: entry(1) });
    expect(out[1]).toEqual({ kind: 'ellipsis', hiddenCount: 2 });
    expect(out[2]).toEqual({ kind: 'entry', entry: entry(4) });
    expect(out[3]).toEqual({ kind: 'entry', entry: entry(5) });
  });

  test('10 entries (deep chain) → [head, ellipsis(7), tail×2]', () => {
    const chain = Array.from({ length: 10 }, (_, i) => entry(i + 1));
    const out = computeVisibleEntries(chain);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ kind: 'entry', entry: entry(1) });
    expect(out[1]).toEqual({ kind: 'ellipsis', hiddenCount: 7 });
    expect(out[2]).toEqual({ kind: 'entry', entry: entry(9) });
    expect(out[3]).toEqual({ kind: 'entry', entry: entry(10) });
  });

  test('hiddenCount invariant: out.kind[ellipsis].hiddenCount + 3 === chain.length (for > limit)', () => {
    for (const n of [5, 6, 7, 20, 100]) {
      const chain = Array.from({ length: n }, (_, i) => entry(i + 1));
      const out = computeVisibleEntries(chain);
      const ellipsis = out.find((v) => v.kind === 'ellipsis');
      if (!ellipsis || ellipsis.kind !== 'ellipsis') throw new Error('missing ellipsis');
      expect(ellipsis.hiddenCount).toBe(n - 3);
    }
  });
});

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: {},
  },
});

function buildEditor(posToId: Map<number, string> | null): Editor {
  const plugins: Plugin[] = [];
  if (posToId !== null) {
    plugins.push(
      new Plugin({
        key: bridgeIdPluginKey,
        state: {
          init: () => ({
            yElementToId: new WeakMap(),
            posToId,
            counter: 0,
          }),
          apply: (_tr, value) => value,
        },
      }),
    );
  }
  const state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph')]),
    plugins,
  });
  return { state } as unknown as Editor;
}

describe('resolveLivePos', () => {
  const entry: BlockChainEntry = { bridgeId: 'b1', componentName: 'Card', pos: 10 };

  test('plugin not registered → returns entry.pos (harness fallback)', () => {
    const editor = buildEditor(null);
    expect(resolveLivePos(editor, entry)).toBe(10);
  });

  test('plugin registered, bridgeId present at same pos → returns live pos', () => {
    const editor = buildEditor(new Map([[10, 'b1']]));
    expect(resolveLivePos(editor, entry)).toBe(10);
  });

  test('plugin registered, bridgeId present at shifted pos → returns the live pos', () => {
    const editor = buildEditor(new Map([[42, 'b1']]));
    expect(resolveLivePos(editor, entry)).toBe(42);
  });

  test('plugin registered, bridgeId absent → returns null (remote-delete guard)', () => {
    const editor = buildEditor(new Map([[10, 'other-bridge-id']]));
    expect(resolveLivePos(editor, entry)).toBeNull();
  });

  test('plugin registered with empty posToId → returns null', () => {
    const editor = buildEditor(new Map());
    expect(resolveLivePos(editor, entry)).toBeNull();
  });
});
