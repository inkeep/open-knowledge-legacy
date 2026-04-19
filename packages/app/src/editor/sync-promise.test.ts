/**
 * Unit tests for sync-promise: module-level cache + timeout + invalidation.
 *
 * These tests drive a real HocuspocusProvider pointed at a dummy WS URL
 * (same pattern as provider-pool.test.ts). The provider never connects,
 * but emitting `synced` / `close` directly exercises the listener wiring.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { HocuspocusProvider } from '@hocuspocus/provider';
import {
  __reapTimedOutEntries,
  __resetSyncPromiseCache,
  __syncPromiseCacheSize,
  __syncPromiseSettled,
  __test_armPendingRejection,
  __test_clearArmedRejection,
  BridgeSetupError,
  invalidateSyncPromise,
  PreSyncDisconnectError,
  rejectSyncPromise,
  SYNC_TIMEOUT_MS,
  SyncTimeoutError,
  syncPromise,
} from './sync-promise';

const DUMMY_WS = 'ws://localhost:1/collab';

function makeProvider(docName: string): HocuspocusProvider {
  return new HocuspocusProvider({
    url: DUMMY_WS,
    name: docName,
  });
}

let providers: HocuspocusProvider[] = [];
function track<T extends HocuspocusProvider>(p: T): T {
  providers.push(p);
  return p;
}

beforeEach(() => {
  __resetSyncPromiseCache();
  providers = [];
});

afterEach(() => {
  __resetSyncPromiseCache();
  for (const p of providers) {
    try {
      p.destroy();
    } catch {
      // ignore
    }
  }
  providers = [];
});

describe('syncPromise creation + idempotency', () => {
  test('creates a cached promise on first call', () => {
    const p = track(makeProvider('doc1'));
    const promise = syncPromise('doc1', p);
    expect(promise).toBeInstanceOf(Promise);
    expect(__syncPromiseCacheSize()).toBe(1);
  });

  test('second call with same docName returns identical reference', () => {
    const p = track(makeProvider('doc1'));
    const a = syncPromise('doc1', p);
    const b = syncPromise('doc1', p);
    expect(a).toBe(b);
    expect(__syncPromiseCacheSize()).toBe(1);
  });

  test('different docNames get different promises', () => {
    const p1 = track(makeProvider('doc1'));
    const p2 = track(makeProvider('doc2'));
    const a = syncPromise('doc1', p1);
    const b = syncPromise('doc2', p2);
    expect(a).not.toBe(b);
    expect(__syncPromiseCacheSize()).toBe(2);
  });
});

describe('syncPromise resolution', () => {
  test('resolves synchronously when provider is already synced (warm path)', async () => {
    // Pool-resident reuse path: provider.synced is already true from a prior
    // mount. Hocuspocus's `set synced` is a no-op when the value is unchanged
    // so a freshly-attached `'synced'` listener would never fire — without the
    // fast-path gate this would hang for the full 30s timeout.
    const p = track(makeProvider('warm-doc'));
    p.synced = true;
    const promise = syncPromise('warm-doc', p);
    await expect(promise).resolves.toBeUndefined();
    // Cache holds a settled sentinel so repeat calls return the same reference.
    expect(__syncPromiseCacheSize()).toBe(1);
    expect(__syncPromiseSettled('warm-doc')).toBe(true);
  });

  test('warm-path returns the same promise reference on repeat calls', () => {
    const p = track(makeProvider('warm-doc'));
    p.synced = true;
    const a = syncPromise('warm-doc', p);
    const b = syncPromise('warm-doc', p);
    // Stable reference is what makes React 19's `use()` short-circuit on
    // subsequent renders (after .status='fulfilled' has been set by React).
    expect(a).toBe(b);
  });

  test('resolves when provider fires synced', async () => {
    const p = track(makeProvider('doc1'));
    const promise = syncPromise('doc1', p);

    // Fire synced on next tick so await sees the pending → resolved transition
    queueMicrotask(() => p.emit('synced', { state: true }));

    await expect(promise).resolves.toBeUndefined();
    // Entry stays in cache after resolve so subsequent calls return the same
    // resolved promise (warm-path stability — see syncPromise lifecycle docstring).
    expect(__syncPromiseCacheSize()).toBe(1);
    expect(__syncPromiseSettled('doc1')).toBe(true);
  });

  test('resolves only once even if synced fires multiple times', async () => {
    const p = track(makeProvider('doc1'));
    const promise = syncPromise('doc1', p);

    p.emit('synced', { state: true });
    p.emit('synced', { state: true });
    p.emit('synced', { state: true });

    await expect(promise).resolves.toBeUndefined();
    expect(__syncPromiseSettled('doc1')).toBe(true);
  });

  test('after synced, a new call returns the same cached resolved promise', async () => {
    const p = track(makeProvider('doc1'));
    const first = syncPromise('doc1', p);
    p.emit('synced', { state: true });
    await first;

    const second = syncPromise('doc1', p);
    // Cache persists settled entries so React's `use()` sees the same
    // .status='fulfilled' thenable across re-renders without a Suspense cycle.
    expect(second).toBe(first);
    expect(__syncPromiseCacheSize()).toBe(1);
  });
});

describe('syncPromise pre-sync close rejection', () => {
  test('rejects with PreSyncDisconnectError when close fires before synced', async () => {
    const p = track(makeProvider('doc1'));
    const promise = syncPromise('doc1', p);

    queueMicrotask(() => {
      p.emit('close', { event: { code: 1006, reason: 'test', wasClean: false } });
    });

    await expect(promise).rejects.toBeInstanceOf(PreSyncDisconnectError);
    // Rejected entry stays in cache so subsequent renders see the same
    // .status='rejected' thenable — React's `use()` re-throws without
    // creating a fresh warm-path resolved promise that would mask the error.
    expect(__syncPromiseSettled('doc1')).toBe(true);
  });

  test('repeat call after rejection returns the same rejected promise', async () => {
    const p = track(makeProvider('doc1'));
    const first = syncPromise('doc1', p);
    p.emit('close', { event: { code: 1006, reason: 'test', wasClean: false } });
    await first.catch(() => {}); // settle the rejection

    const second = syncPromise('doc1', p);
    expect(second).toBe(first);
    await expect(second).rejects.toBeInstanceOf(PreSyncDisconnectError);
  });

  test('PreSyncDisconnectError carries docName', async () => {
    const p = track(makeProvider('doc-with-name'));
    const promise = syncPromise('doc-with-name', p);
    queueMicrotask(() => {
      p.emit('close', { event: { code: 1006, reason: 'test', wasClean: false } });
    });

    try {
      await promise;
      throw new Error('should have rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(PreSyncDisconnectError);
      expect((err as PreSyncDisconnectError).docName).toBe('doc-with-name');
      expect((err as Error).message).toContain('doc-with-name');
    }
  });

  test('close after synced does not re-reject (entry settled)', async () => {
    const p = track(makeProvider('doc1'));
    const promise = syncPromise('doc1', p);
    p.emit('synced', { state: true });
    await promise;

    // Close after settle — no-op, must not throw
    p.emit('close', { event: { code: 1000, reason: 'normal', wasClean: true } });
    expect(__syncPromiseSettled('doc1')).toBe(true);
  });
});

describe('syncPromise timeout', () => {
  test('rejects with SyncTimeoutError after 30s elapsed', async () => {
    const p = track(makeProvider('slow-doc'));
    const origSetTimeout = globalThis.setTimeout;
    // Monkey-patch setTimeout for this test to capture + fast-fire the 30s timer
    let capturedTimer: (() => void) | null = null;
    // @ts-expect-error — intentional override for test
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      if (ms === SYNC_TIMEOUT_MS) {
        capturedTimer = fn;
        // Return a dummy handle that clearTimeout can accept
        return { __dummy: true } as unknown as ReturnType<typeof origSetTimeout>;
      }
      return origSetTimeout(fn, ms);
    }) as typeof globalThis.setTimeout;

    try {
      const promise = syncPromise('slow-doc', p);
      expect(capturedTimer).not.toBeNull();
      // Fire the captured timer manually to simulate 30s elapsing
      capturedTimer?.();
      await expect(promise).rejects.toBeInstanceOf(SyncTimeoutError);
      // Rejected entry stays in cache (settled sentinel) — see lifecycle docs.
      expect(__syncPromiseSettled('slow-doc')).toBe(true);
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });

  test('SyncTimeoutError carries docName + elapsedMs', async () => {
    const p = track(makeProvider('slow-doc'));
    const origSetTimeout = globalThis.setTimeout;
    let capturedTimer: (() => void) | null = null;
    // @ts-expect-error — intentional override for test
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      if (ms === SYNC_TIMEOUT_MS) {
        capturedTimer = fn;
        return { __dummy: true } as unknown as ReturnType<typeof origSetTimeout>;
      }
      return origSetTimeout(fn, ms);
    }) as typeof globalThis.setTimeout;

    try {
      const promise = syncPromise('slow-doc', p);
      capturedTimer?.();
      try {
        await promise;
        throw new Error('should have rejected');
      } catch (err) {
        expect(err).toBeInstanceOf(SyncTimeoutError);
        expect((err as SyncTimeoutError).docName).toBe('slow-doc');
        expect((err as SyncTimeoutError).elapsedMs).toBeGreaterThanOrEqual(0);
      }
    } finally {
      globalThis.setTimeout = origSetTimeout;
    }
  });
});

describe('invalidateSyncPromise', () => {
  test('removes the cache entry without rejecting', async () => {
    const p = track(makeProvider('doc1'));
    const promise = syncPromise('doc1', p);
    expect(__syncPromiseCacheSize()).toBe(1);

    invalidateSyncPromise('doc1');
    expect(__syncPromiseCacheSize()).toBe(0);

    // The original promise is orphaned — it neither resolves nor rejects.
    // Verify with Promise.race against a short delay.
    const result = await Promise.race([
      promise.then(() => 'resolved'),
      promise.catch(() => 'rejected'),
      new Promise<string>((r) => setTimeout(() => r('pending'), 50)),
    ]);
    expect(result).toBe('pending');
  });

  test('after invalidate, next call returns fresh promise', () => {
    const p = track(makeProvider('doc1'));
    const first = syncPromise('doc1', p);
    invalidateSyncPromise('doc1');

    const second = syncPromise('doc1', p);
    expect(second).not.toBe(first);
    expect(__syncPromiseCacheSize()).toBe(1);
  });

  test('after rejection + invalidate, next call returns fresh promise (retry path)', async () => {
    const p = track(makeProvider('doc1'));
    const first = syncPromise('doc1', p);
    p.emit('close', { event: { code: 1006, reason: 'test', wasClean: false } });
    await first.catch(() => {});

    // Repeat call returns SAME rejected promise (boundary keeps catching)
    expect(syncPromise('doc1', p)).toBe(first);

    // Explicit invalidate (e.g. retry button) → next call gets fresh promise
    invalidateSyncPromise('doc1');
    const fresh = syncPromise('doc1', p);
    expect(fresh).not.toBe(first);
  });

  test('invalidate is idempotent / no-op when entry missing', () => {
    expect(() => invalidateSyncPromise('never-created')).not.toThrow();
    expect(__syncPromiseCacheSize()).toBe(0);
  });

  test('after invalidate, synced on the old provider does NOT settle the orphaned promise', async () => {
    const p = track(makeProvider('doc1'));
    const orphaned = syncPromise('doc1', p);
    invalidateSyncPromise('doc1');

    // Fire synced — listeners should have been detached, so orphaned stays pending
    p.emit('synced', { state: true });

    const result = await Promise.race([
      orphaned.then(() => 'resolved'),
      orphaned.catch(() => 'rejected'),
      new Promise<string>((r) => setTimeout(() => r('pending'), 50)),
    ]);
    expect(result).toBe('pending');
  });
});

describe('rejectSyncPromise (BridgeSetupError surface)', () => {
  test('rejects an active cache entry with the supplied error', async () => {
    const p = track(makeProvider('doc1'));
    const promise = syncPromise('doc1', p);
    const cause = new Error('observer wiring failed');

    const ok = rejectSyncPromise('doc1', new BridgeSetupError('doc1', cause));
    expect(ok).toBe(true);

    try {
      await promise;
      throw new Error('should have rejected');
    } catch (err) {
      expect(err).toBeInstanceOf(BridgeSetupError);
      expect((err as BridgeSetupError).docName).toBe('doc1');
      expect((err as BridgeSetupError).cause).toBe(cause);
    }
  });

  test('rejected entry stays in cache so subsequent renders catch the same error', async () => {
    // Models the React re-render after rejection: DocumentBoundary's `use()`
    // sees the same rejected promise and re-throws synchronously, letting
    // DocumentErrorBoundary render its fallback. Without persistence, a fresh
    // syncPromise call would warm-path-resolve on the broken provider and
    // mask the error.
    const p = track(makeProvider('doc1'));
    const first = syncPromise('doc1', p);
    rejectSyncPromise('doc1', new BridgeSetupError('doc1'));
    await first.catch(() => {});

    const second = syncPromise('doc1', p);
    expect(second).toBe(first);
    await expect(second).rejects.toBeInstanceOf(BridgeSetupError);
  });

  test('returns false when no entry exists', () => {
    const ok = rejectSyncPromise('never-created', new BridgeSetupError('never-created'));
    expect(ok).toBe(false);
  });

  test('returns false on already-settled entry (idempotent)', async () => {
    const p = track(makeProvider('doc1'));
    const promise = syncPromise('doc1', p);
    rejectSyncPromise('doc1', new BridgeSetupError('doc1'));
    await promise.catch(() => {});

    // Second reject is a no-op
    const ok = rejectSyncPromise('doc1', new BridgeSetupError('doc1'));
    expect(ok).toBe(false);
  });
});

describe('error class shape', () => {
  test('SyncTimeoutError extends Error and has `name`', () => {
    const err = new SyncTimeoutError('foo', 30_000);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SyncTimeoutError');
    expect(err.docName).toBe('foo');
    expect(err.elapsedMs).toBe(30_000);
  });

  test('PreSyncDisconnectError extends Error and has `name`', () => {
    const err = new PreSyncDisconnectError('bar');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PreSyncDisconnectError');
    expect(err.docName).toBe('bar');
  });

  test('BridgeSetupError extends Error and carries docName + cause', () => {
    const cause = new Error('schema mismatch');
    const err = new BridgeSetupError('baz', cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BridgeSetupError');
    expect(err.docName).toBe('baz');
    expect(err.cause).toBe(cause);
    expect(err.message).toContain('baz');
    expect(err.message).toContain('schema mismatch');
  });
});

describe('__test_armPendingRejection — race-free e2e error-path hook', () => {
  test('arms a rejection that fires on the next syncPromise creation with timeout kind', async () => {
    const p = track(makeProvider('doc-armed-timeout'));
    __test_armPendingRejection('doc-armed-timeout', 'timeout');
    const promise = syncPromise('doc-armed-timeout', p);
    await expect(promise).rejects.toBeInstanceOf(SyncTimeoutError);
    // Arm should be consumed (one-shot semantics).
    expect(__test_clearArmedRejection('doc-armed-timeout')).toBe(false);
  });

  test('arms a rejection with predisconnect kind', async () => {
    const p = track(makeProvider('doc-armed-predisconnect'));
    __test_armPendingRejection('doc-armed-predisconnect', 'predisconnect');
    const promise = syncPromise('doc-armed-predisconnect', p);
    await expect(promise).rejects.toBeInstanceOf(PreSyncDisconnectError);
  });

  test('defaults to timeout kind when kind is omitted', async () => {
    const p = track(makeProvider('doc-armed-default'));
    __test_armPendingRejection('doc-armed-default');
    const promise = syncPromise('doc-armed-default', p);
    await expect(promise).rejects.toBeInstanceOf(SyncTimeoutError);
  });

  test('arm takes priority over warm-provider fast path', async () => {
    // Even when provider.synced=true (which would normally short-circuit to
    // a resolved promise), an armed rejection must win so the error boundary
    // surfaces. This is load-bearing for F6 where the nav target's provider
    // may have been warm from a prior test step.
    const p = track(makeProvider('doc-armed-warm'));
    p.synced = true;
    __test_armPendingRejection('doc-armed-warm', 'timeout');
    const promise = syncPromise('doc-armed-warm', p);
    await expect(promise).rejects.toBeInstanceOf(SyncTimeoutError);
  });

  test('is one-shot: second syncPromise call returns the cached rejected promise', async () => {
    const p = track(makeProvider('doc-armed-once'));
    __test_armPendingRejection('doc-armed-once', 'timeout');

    // First call consumes the arm → rejected promise cached.
    const first = syncPromise('doc-armed-once', p);
    await expect(first).rejects.toBeInstanceOf(SyncTimeoutError);

    // Second call returns the SAME cached (rejected) promise — the arm was
    // one-shot and the rejected entry persists for React `use()` stability
    // (re-throwing synchronously across boundary re-renders).
    const second = syncPromise('doc-armed-once', p);
    expect(second).toBe(first);

    // Arm is consumed — `__test_clearArmedRejection` should see nothing to clear.
    expect(__test_clearArmedRejection('doc-armed-once')).toBe(false);
  });

  test('arm is consumed on creation, so a fresh syncPromise after invalidate is NOT armed', async () => {
    // Arm + create consumes the arm on the first call. After invalidate, a
    // new syncPromise call MUST follow the normal pending path — proven by
    // checking the entry is not settled before any async event fires.
    const p = track(makeProvider('doc-consumed-arm'));
    __test_armPendingRejection('doc-consumed-arm', 'timeout');
    const first = syncPromise('doc-consumed-arm', p);
    await expect(first).rejects.toBeInstanceOf(SyncTimeoutError);

    invalidateSyncPromise('doc-consumed-arm');
    // Arm is one-shot; the invalidate + fresh-create sequence starts with no arm.
    expect(__test_clearArmedRejection('doc-consumed-arm')).toBe(false);

    // A fresh syncPromise does NOT synchronously reject (the rejection would
    // only come from the real provider lifecycle, not the consumed arm).
    // Snapshot the settled-state BEFORE any async tick so the WS close path
    // cannot mutate it.
    const fresh = syncPromise('doc-consumed-arm', p);
    expect(__syncPromiseSettled('doc-consumed-arm')).toBe(false);
    // Prevent unhandled rejection noise from the provider's eventual close.
    fresh.catch(() => {});
  });

  test('__test_clearArmedRejection returns true when an arm was removed, false otherwise', () => {
    __test_armPendingRejection('doc-clear', 'timeout');
    expect(__test_clearArmedRejection('doc-clear')).toBe(true);
    expect(__test_clearArmedRejection('doc-clear')).toBe(false);
    expect(__test_clearArmedRejection('never-armed')).toBe(false);
  });

  test('__resetSyncPromiseCache also clears pending arms', () => {
    __test_armPendingRejection('doc-leak', 'timeout');
    __resetSyncPromiseCache();
    expect(__test_clearArmedRejection('doc-leak')).toBe(false);
  });
});

describe('tab-sleep resilience (__reapTimedOutEntries)', () => {
  /**
   * Browser background-tab throttling can stretch the 30s `setTimeout`
   * indefinitely, so the visibility-change handler is the deterministic
   * safety net. The handler itself is a thin DOM-gated wrapper around
   * `__reapTimedOutEntries(now)` — the pure helper we test here. The
   * wrapper is verified indirectly via the Playwright suite which runs in
   * a real browser.
   */
  test('rejects pending entry when elapsed wall-clock time exceeds timeout', async () => {
    const p = track(makeProvider('sleepy-doc'));
    const promise = syncPromise('sleepy-doc', p);
    const settled = promise.catch((e: unknown) => e);

    const createdAt = Date.now();
    // Simulate "user tabbed back after a 60s tab-sleep" — wall-clock now is
    // past the 30s timeout for this entry.
    const rejected = __reapTimedOutEntries(createdAt + SYNC_TIMEOUT_MS + 1_000);

    expect(rejected).toBe(1);
    const result = await settled;
    expect(result).toBeInstanceOf(SyncTimeoutError);
    expect(__syncPromiseSettled('sleepy-doc')).toBe(true);
  });

  test('does not reject entries whose elapsed time is within the timeout', () => {
    const p = track(makeProvider('quick-doc'));
    const promise = syncPromise('quick-doc', p);
    promise.catch(() => {}); // Prevent unhandled rejection in teardown

    const rejected = __reapTimedOutEntries(Date.now() + 1_000);

    expect(rejected).toBe(0);
    expect(__syncPromiseSettled('quick-doc')).toBe(false);
  });

  test('skips already-settled entries (idempotent re-entrance)', async () => {
    const p = track(makeProvider('synced-doc'));
    const promise = syncPromise('synced-doc', p);
    queueMicrotask(() => p.emit('synced', { state: true }));
    await promise;

    // Even far in the future, the settled entry stays settled — no double-reject.
    const rejected = __reapTimedOutEntries(Date.now() + SYNC_TIMEOUT_MS * 2);

    expect(rejected).toBe(0);
    expect(__syncPromiseSettled('synced-doc')).toBe(true);
  });
});
