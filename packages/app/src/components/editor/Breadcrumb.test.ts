/**
 * Breadcrumb unit tests — pure helpers only (bun:test, no DOM/React).
 *
 * Covers two co-located helpers exported from `Breadcrumb.tsx`:
 *
 *   1. `computeVisibleEntries` — head-truncation against
 *      MAX_VISIBLE_SEGMENTS (=4). Branching matrix: ≤ limit passthrough,
 *      = limit boundary, > limit → [head, ellipsis, ...tail×2], deep chain
 *      hiddenCount invariant, empty chain.
 *
 *   2. `resolveLivePos` — bridge-id-aware live-pos resolver. Three branches:
 *      (a) plugin not registered (harness env) → return `entry.pos` fallback;
 *      (b) plugin registered AND bridgeId present in posToId → return live
 *      pos (the happy path, shifts under collaborative edits);
 *      (c) plugin registered AND bridgeId absent from posToId → return null
 *      (remote peer deleted the ancestor between render and click).
 *
 *   Branch (c) is the defensive path that prevents the original stale-pos
 *   bug. Without this test a refactor that flipped it to `return entry.pos`
 *   would silently pass, because E2E tests don't cover remote-delete races.
 *
 * Follows the `entry-label.test.ts` precedent for testing pure selection
 * helpers (bun:test, factory fns for fixtures, no DOM).
 */

import { describe, expect, test } from 'bun:test';
import type { Editor } from '@tiptap/core';
import { Schema } from '@tiptap/pm/model';
import { EditorState, Plugin } from '@tiptap/pm/state';
import { bridgeIdPluginKey } from '../../editor/extensions/bridge-id-plugin.ts';
import type { BlockChainEntry } from '../../editor/extensions/selection-state-plugin.ts';
import { computeVisibleEntries, resolveLivePos } from './Breadcrumb.tsx';

/** Fixture factory — every field is distinct so assertions can identify
 *  which entry survived truncation. */
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
    // Spot-check the invariant that hidden + (head=1) + (tail=2) = total
    for (const n of [5, 6, 7, 20, 100]) {
      const chain = Array.from({ length: n }, (_, i) => entry(i + 1));
      const out = computeVisibleEntries(chain);
      const ellipsis = out.find((v) => v.kind === 'ellipsis');
      if (!ellipsis || ellipsis.kind !== 'ellipsis') throw new Error('missing ellipsis');
      expect(ellipsis.hiddenCount).toBe(n - 3);
    }
  });
});

// ── resolveLivePos — bridgeId-aware live-pos resolver ────────────────────

/** Minimal schema — just needs a doc + block to instantiate EditorState. */
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'text*' },
    text: {},
  },
});

/** Build an EditorState with `bridgeIdPluginKey` registered and a specific
 *  `posToId` map. If `posToId` is null, the plugin isn't registered —
 *  simulating a harness/test env that doesn't include bridge-id-plugin.
 *
 *  Returns something that type-checks as `Editor` through the narrow API
 *  `resolveLivePos` uses (`editor.state`). Avoids spinning up TipTap proper
 *  — unit tests for pure helpers should not require a browser-only
 *  rendering stack. */
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
    // Test env without bridge-id-plugin (e.g. `bridge-matrix.test.ts`
    // harness). Return captured pos so tests can still exercise
    // breadcrumb click handlers without wiring the full plugin stack.
    const editor = buildEditor(null);
    expect(resolveLivePos(editor, entry)).toBe(10);
  });

  test('plugin registered, bridgeId present at same pos → returns live pos', () => {
    // No collaborative drift — live pos matches captured pos.
    const editor = buildEditor(new Map([[10, 'b1']]));
    expect(resolveLivePos(editor, entry)).toBe(10);
  });

  test('plugin registered, bridgeId present at shifted pos → returns the live pos', () => {
    // Collaborative edit shifted the block — bridgeId is stable, pos moved.
    // Resolution must use the live pos (42), not the captured pos (10).
    const editor = buildEditor(new Map([[42, 'b1']]));
    expect(resolveLivePos(editor, entry)).toBe(42);
  });

  test('plugin registered, bridgeId absent → returns null (remote-delete guard)', () => {
    // Remote peer deleted the ancestor between render and click. Returning
    // entry.pos here would select whatever node now occupies offset 10 —
    // the exact stale-pos bug resolveLivePos exists to prevent.
    const editor = buildEditor(new Map([[10, 'other-bridge-id']]));
    expect(resolveLivePos(editor, entry)).toBeNull();
  });

  test('plugin registered with empty posToId → returns null', () => {
    // Boundary case — plugin wired but doc has no jsxComponents indexed.
    // Same defensive behavior as the remote-delete case.
    const editor = buildEditor(new Map());
    expect(resolveLivePos(editor, entry)).toBeNull();
  });
});
