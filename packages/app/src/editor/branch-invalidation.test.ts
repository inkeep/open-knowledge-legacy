import { afterEach, describe, expect, mock, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { handleBranchSwitched } from './branch-invalidation';
import { ProviderPool } from './provider-pool';

// Pool ingests real HocuspocusProvider instances pointing at an unreachable
// URL. Providers stall in 'connecting'; no WebSocket round-trip occurs. This
// is the same pattern `provider-pool.test.ts` uses for mechanism-only checks
// — we care about clearData / recycleAllEntries dispatch, not wire behavior.
const DUMMY_WS = 'ws://localhost:1/collab';

let pool: ProviderPool;

afterEach(() => {
  pool?.dispose();
});

function docName(prefix = 'branch-inv'): string {
  return `${prefix}-${randomUUID()}`;
}

describe('handleBranchSwitched', () => {
  test("calls clearData on every entry's persistence", async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const d1 = docName('d1');
    const d2 = docName('d2');
    const e1 = pool.open(d1);
    const e2 = pool.open(d2);
    if (!e1 || !e2) throw new Error('pool.open returned null');
    if (!e1.persistence || !e2.persistence) throw new Error('entry missing persistence');

    const clear1 = mock(() => Promise.resolve());
    const clear2 = mock(() => Promise.resolve());
    e1.persistence.clearData = clear1;
    e2.persistence.clearData = clear2;

    await handleBranchSwitched(pool, 'feature');

    expect(clear1).toHaveBeenCalledTimes(1);
    expect(clear2).toHaveBeenCalledTimes(1);
  });

  test('recycles all entries after clearData resolves', async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const d1 = docName('d1');
    const d2 = docName('d2');
    const e1 = pool.open(d1);
    const e2 = pool.open(d2);
    if (!e1 || !e2) throw new Error('pool.open returned null');
    if (!e1.persistence || !e2.persistence) throw new Error('entry missing persistence');

    let clearResolvedAt = 0;
    let recycleCalledAt = 0;
    const clearPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        clearResolvedAt = Date.now();
        resolve();
      }, 20);
    });
    e1.persistence.clearData = mock(() => clearPromise);
    e2.persistence.clearData = mock(() => Promise.resolve());

    const originalRecycle = pool.recycleAllEntries.bind(pool);
    pool.recycleAllEntries = mock(() => {
      recycleCalledAt = Date.now();
      originalRecycle();
    });

    await handleBranchSwitched(pool, 'feature');

    expect(pool.recycleAllEntries).toHaveBeenCalledTimes(1);
    expect(recycleCalledAt).toBeGreaterThanOrEqual(clearResolvedAt);
  });

  test('skips entries that are tearing down', async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const d1 = docName('d1');
    const d2 = docName('d2');
    const e1 = pool.open(d1);
    const e2 = pool.open(d2);
    if (!e1 || !e2) throw new Error('pool.open returned null');
    if (!e1.persistence || !e2.persistence) throw new Error('entry missing persistence');

    const clear1 = mock(() => Promise.resolve());
    const clear2 = mock(() => Promise.resolve());
    e1.persistence.clearData = clear1;
    e2.persistence.clearData = clear2;

    e1.tearingDown = true;

    await handleBranchSwitched(pool, 'feature');

    expect(clear1).toHaveBeenCalledTimes(0);
    expect(clear2).toHaveBeenCalledTimes(1);
  });

  test('skips entries whose persistence is null (mid-teardown)', async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const d1 = docName('d1');
    const e1 = pool.open(d1);
    if (!e1) throw new Error('pool.open returned null');

    e1.persistence = null;

    // Should not throw.
    await handleBranchSwitched(pool, 'feature');

    expect(pool.has(d1)).toBe(false);
  });

  test('swallows clearData failures and still recycles', async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const d1 = docName('d1');
    const e1 = pool.open(d1);
    if (!e1?.persistence) throw new Error('pool.open returned null');

    e1.persistence.clearData = mock(() =>
      Promise.reject(new Error('simulated-idb-quota-exhausted')),
    );

    const originalRecycle = pool.recycleAllEntries.bind(pool);
    const recycleSpy = mock(() => {
      originalRecycle();
    });
    pool.recycleAllEntries = recycleSpy;

    const logSpy = mock((_msg: string) => {});
    const originalWarn = console.warn;
    console.warn = logSpy as unknown as typeof console.warn;
    try {
      await handleBranchSwitched(pool, 'feature');
    } finally {
      console.warn = originalWarn;
    }

    expect(recycleSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalled();
    const firstLog: string | undefined = logSpy.mock.calls[0]?.[0];
    if (firstLog === undefined) throw new Error('expected warn call');
    const parsed = JSON.parse(firstLog) as {
      event: string;
      branch: string;
      docName?: string;
      reason?: string;
    };
    expect(parsed.event).toBe('ok-branch-switched-clear-failed');
    expect(parsed.branch).toBe('feature');
  });

  test('is a no-op when the pool has no entries', async () => {
    pool = new ProviderPool(3, DUMMY_WS);
    const recycleSpy = mock(() => {});
    pool.recycleAllEntries = recycleSpy;

    await handleBranchSwitched(pool, 'feature');

    expect(recycleSpy).toHaveBeenCalledTimes(1);
  });
});
