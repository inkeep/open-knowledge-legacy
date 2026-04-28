import { describe, expect, test } from 'bun:test';
import { setImmediate } from 'node:timers/promises';
import { createRefreshScheduler } from './refresh-scheduler';

describe('createRefreshScheduler', () => {
  test('starts a refresh immediately when idle', async () => {
    let calls = 0;
    const scheduler = createRefreshScheduler(() => {
      calls += 1;
    });

    scheduler.request();
    expect(calls).toBe(1);
  });

  test('coalesces burst requests while a refresh is in flight', async () => {
    const first = Promise.withResolvers<void>();
    const started: number[] = [];
    const scheduler = createRefreshScheduler(() => {
      started.push(started.length + 1);
      return started.length === 1 ? first.promise : undefined;
    });

    scheduler.request();
    scheduler.request();
    scheduler.request();
    expect(started).toEqual([1]);

    first.resolve();
    await setImmediate();

    expect(started).toEqual([1, 2]);
  });

  test('runs at most one trailing refresh for many in-flight requests', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
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
    await setImmediate();
    scheduler.request();
    scheduler.request();
    expect(calls).toBe(2);

    second.resolve();
    await setImmediate();

    expect(calls).toBe(3);
  });

  test('dispose prevents future and trailing refreshes', async () => {
    const first = Promise.withResolvers<void>();
    let calls = 0;
    const scheduler = createRefreshScheduler(() => {
      calls += 1;
      return first.promise;
    });

    scheduler.request();
    scheduler.request();
    scheduler.dispose();
    first.resolve();
    scheduler.request();

    expect(calls).toBe(1);
  });
});
