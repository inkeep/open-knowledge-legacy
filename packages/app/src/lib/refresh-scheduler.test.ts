import { describe, expect, test } from 'bun:test';
import { createRefreshScheduler } from './refresh-scheduler';

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createRefreshScheduler', () => {
  test('starts a refresh immediately when idle', async () => {
    let calls = 0;
    const scheduler = createRefreshScheduler(() => {
      calls += 1;
    });

    scheduler.request();
    await flushMicrotasks();

    expect(calls).toBe(1);
  });

  test('coalesces burst requests while a refresh is in flight', async () => {
    const first = createDeferred();
    const started: number[] = [];
    const scheduler = createRefreshScheduler(() => {
      started.push(started.length + 1);
      return started.length === 1 ? first.promise : undefined;
    });

    scheduler.request();
    scheduler.request();
    scheduler.request();
    await flushMicrotasks();

    expect(started).toEqual([1]);

    first.resolve();
    await flushMicrotasks();

    expect(started).toEqual([1, 2]);
  });

  test('runs at most one trailing refresh for many in-flight requests', async () => {
    const first = createDeferred();
    const second = createDeferred();
    let calls = 0;
    const scheduler = createRefreshScheduler(() => {
      calls += 1;
      if (calls === 1) return first.promise;
      if (calls === 2) return second.promise;
    });

    scheduler.request();
    scheduler.request();
    scheduler.request();
    first.resolve();
    await flushMicrotasks();
    scheduler.request();
    scheduler.request();
    await flushMicrotasks();

    expect(calls).toBe(2);

    second.resolve();
    await flushMicrotasks();

    expect(calls).toBe(3);
  });

  test('dispose prevents future and trailing refreshes', async () => {
    const first = createDeferred();
    let calls = 0;
    const scheduler = createRefreshScheduler(() => {
      calls += 1;
      return first.promise;
    });

    scheduler.request();
    scheduler.request();
    scheduler.dispose();
    first.resolve();
    await flushMicrotasks();
    scheduler.request();
    await flushMicrotasks();

    expect(calls).toBe(1);
  });
});
