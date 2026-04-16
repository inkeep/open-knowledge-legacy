/**
 * computeVisibleEntries unit tests — pure helper for breadcrumb head-truncation.
 *
 * Covers the branching matrix around MAX_VISIBLE_SEGMENTS (=4):
 *   - ≤ limit → passthrough (all entries kept, no ellipsis)
 *   - = limit exactly → passthrough (boundary case)
 *   - > limit → [head, ellipsis, ...last-two] with correct hiddenCount
 *   - large chain → hiddenCount reflects every skipped middle entry
 *   - empty chain → empty output
 *
 * Follows the `entry-label.test.ts` precedent for testing pure selection
 * helpers (bun:test, factory fns for fixtures, no DOM).
 */

import { describe, expect, test } from 'bun:test';
import type { BlockChainEntry } from '../../editor/extensions/selection-state-plugin.ts';
import { computeVisibleEntries } from './Breadcrumb.tsx';

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
