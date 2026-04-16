/**
 * EditorActivityPool — unit tests for the pure `computeActivityMountList` helper
 * + the exported `ACTIVITY_MOUNT_LIMIT` constant.
 *
 * Repo convention (STOP_IF rules out adding @testing-library/react + happy-dom):
 * UI helpers are unit-tested at the pure-function altitude; render/mount
 * behavior — Activity mode flips, dual-editor concurrent mount, StrictMode
 * idempotence — is covered by Playwright E2E in US-011 (F1 warm nav,
 * F2 cold-nav continuity) and US-013 (F10 source-editor parity, F16 StrictMode).
 *
 * What the pure helper guarantees (and what these tests pin):
 *   1. System docs (`__system__`) never appear in the mount list.
 *   2. Active doc is always present if it's anywhere in `entries` — even when
 *      its `lastAccessedAt` would put it outside the top-N.
 *   3. Otherwise: top-N by `lastAccessedAt` descending (MRU first).
 */

import { describe, expect, test } from 'bun:test';
import { SYSTEM_DOC_NAME } from '@inkeep/open-knowledge-core';
import EditorActivityPool, {
  ACTIVITY_MOUNT_LIMIT,
  computeActivityMountList,
} from './EditorActivityPool';

interface FakeEntry {
  docName: string;
  lastAccessedAt: number;
}

const entry = (docName: string, lastAccessedAt: number): FakeEntry => ({
  docName,
  lastAccessedAt,
});

describe('ACTIVITY_MOUNT_LIMIT', () => {
  test('is 3 — matches SPEC.md §10 DX9', () => {
    expect(ACTIVITY_MOUNT_LIMIT).toBe(3);
  });

  test('is strictly less than ProviderPool MAX_POOL=10 (decoupling invariant)', () => {
    // The whole point of DX9 is that mounted-editor count can be smaller than
    // pool size. If someone bumps ACTIVITY_MOUNT_LIMIT past MAX_POOL the
    // decoupling collapses; this test catches that.
    expect(ACTIVITY_MOUNT_LIMIT).toBeLessThan(10);
  });
});

describe('EditorActivityPool module contract', () => {
  test('default export is a function (React component)', () => {
    expect(typeof EditorActivityPool).toBe('function');
  });
});

describe('computeActivityMountList — basic sizing', () => {
  test('empty entries → empty list', () => {
    expect(computeActivityMountList([], null, 3)).toEqual([]);
    expect(computeActivityMountList([], 'doc-a', 3)).toEqual([]);
  });

  test('single entry → singleton list (regardless of active state)', () => {
    const a = entry('a', 100);
    expect(computeActivityMountList([a], 'a', 3)).toEqual([a]);
    expect(computeActivityMountList([a], null, 3)).toEqual([a]);
  });

  test('limit=0 → empty list (defensive — caller should not pass 0 but should not crash)', () => {
    const a = entry('a', 100);
    expect(computeActivityMountList([a], 'a', 0)).toEqual([]);
  });

  test('limit=-1 → empty list (defensive)', () => {
    const a = entry('a', 100);
    expect(computeActivityMountList([a], 'a', -1)).toEqual([]);
  });
});

describe('computeActivityMountList — MRU sorting', () => {
  test('returns entries sorted by lastAccessedAt descending', () => {
    const a = entry('a', 100);
    const b = entry('b', 300);
    const c = entry('c', 200);
    const result = computeActivityMountList([a, b, c], 'b', 3);
    expect(result.map((e) => e.docName)).toEqual(['b', 'c', 'a']);
  });

  test('is independent of input order — re-sorts internally', () => {
    const a = entry('a', 100);
    const b = entry('b', 300);
    const c = entry('c', 200);
    // Different input orderings — same MRU output.
    expect(computeActivityMountList([a, b, c], null, 3).map((e) => e.docName)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(computeActivityMountList([c, a, b], null, 3).map((e) => e.docName)).toEqual([
      'b',
      'c',
      'a',
    ]);
    expect(computeActivityMountList([b, a, c], null, 3).map((e) => e.docName)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
});

describe('computeActivityMountList — limit bounding', () => {
  test('4 entries with limit=3 → top 3 by lastAccessedAt', () => {
    const a = entry('a', 100);
    const b = entry('b', 200);
    const c = entry('c', 300);
    const d = entry('d', 400);
    const result = computeActivityMountList([a, b, c, d], 'd', 3);
    expect(result.map((e) => e.docName)).toEqual(['d', 'c', 'b']);
  });

  test('10 entries with limit=3 → top 3', () => {
    const entries: FakeEntry[] = Array.from({ length: 10 }, (_, i) => entry(`doc${i}`, i * 10));
    const result = computeActivityMountList(entries, 'doc9', 3);
    expect(result.map((e) => e.docName)).toEqual(['doc9', 'doc8', 'doc7']);
  });

  test('exactly limit entries → returns all of them', () => {
    const a = entry('a', 100);
    const b = entry('b', 200);
    const c = entry('c', 300);
    const result = computeActivityMountList([a, b, c], 'c', 3);
    expect(result).toHaveLength(3);
  });
});

describe('computeActivityMountList — active-doc force-inclusion (invariant #2)', () => {
  test('active doc not in top-N is force-included by displacing LRU', () => {
    // 'a' is least-recent (oldest), but it's the active doc. It must appear in
    // the result even though its lastAccessedAt would otherwise put it outside.
    const a = entry('a', 50); // active but oldest
    const b = entry('b', 200);
    const c = entry('c', 300);
    const d = entry('d', 400);
    const result = computeActivityMountList([a, b, c, d], 'a', 3);
    const names = result.map((e) => e.docName);
    expect(names).toContain('a');
    expect(result).toHaveLength(3);
    // The two MRU non-active entries (d, c) should be preserved; the LRU member
    // of the would-be top-N (b) is displaced by the active doc.
    expect(names).toContain('d');
    expect(names).toContain('c');
    expect(names).not.toContain('b');
  });

  test('active doc absent from entries → top-N ignored (no fabrication)', () => {
    const a = entry('a', 100);
    const b = entry('b', 200);
    const result = computeActivityMountList([a, b], 'nonexistent', 3);
    // active is bogus; we don't synthesize an entry for it.
    expect(result.map((e) => e.docName)).toEqual(['b', 'a']);
  });

  test('active doc already in top-N → no displacement', () => {
    const a = entry('a', 100);
    const b = entry('b', 200);
    const c = entry('c', 300);
    const d = entry('d', 400);
    // 'c' is active and naturally in top-3; should be unchanged.
    const result = computeActivityMountList([a, b, c, d], 'c', 3);
    expect(result.map((e) => e.docName)).toEqual(['d', 'c', 'b']);
  });

  test('null activeDocName → just top-N, no force-include', () => {
    const a = entry('a', 100);
    const b = entry('b', 200);
    const c = entry('c', 300);
    const d = entry('d', 400);
    const result = computeActivityMountList([a, b, c, d], null, 3);
    expect(result.map((e) => e.docName)).toEqual(['d', 'c', 'b']);
  });
});

describe('computeActivityMountList — system doc filtering (DX7 defense-in-depth)', () => {
  test('__system__ doc filtered out even if present in entries', () => {
    // ProviderPool.open already rejects system docs at admission, but the helper
    // still filters defensively so a regression at admission can't leak the
    // system doc into the mount list.
    const sys = entry(SYSTEM_DOC_NAME, 999);
    const a = entry('a', 100);
    const result = computeActivityMountList([sys, a], 'a', 3);
    expect(result.map((e) => e.docName)).not.toContain(SYSTEM_DOC_NAME);
    expect(result.map((e) => e.docName)).toEqual(['a']);
  });

  test('__system__ never force-included even when set as activeDocName', () => {
    const sys = entry(SYSTEM_DOC_NAME, 100);
    const a = entry('a', 50);
    // Even if some bug in caller code passes __system__ as active, the filter
    // wins — invariant #1 dominates invariant #2.
    const result = computeActivityMountList([sys, a], SYSTEM_DOC_NAME, 3);
    expect(result.map((e) => e.docName)).not.toContain(SYSTEM_DOC_NAME);
  });
});
