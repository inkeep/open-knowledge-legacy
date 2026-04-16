/**
 * syncPromise — React-19-idiomatic subscription-to-event primitive that bridges
 * HocuspocusProvider's `synced` event to React Suspense via `use(promise)`.
 *
 * Module-level cache by docName. Promise identity is stable across renders —
 * React Compiler-safe because module state is out of compiler scope, and
 * `use(promise)` requires the same reference across remounts / StrictMode
 * double-invoke to avoid infinite suspension.
 *
 * Lifecycle:
 *   - `syncPromise(docName, provider)` creates or returns the cached promise.
 *     Attaches `synced` + `close` listeners and starts a 30s timeout.
 *   - On `synced`: resolve + auto-cleanup (listeners off, timeout cleared, cache entry removed).
 *   - On pre-sync `close`: reject with PreSyncDisconnectError + cleanup.
 *   - On 30s timeout: reject with SyncTimeoutError + cleanup.
 *   - `invalidateSyncPromise(docName)` tears the entry down without rejecting
 *     (provider-pool calls this on destroy/recycle; the next `syncPromise` call
 *     creates a fresh promise).
 *
 * See SPEC.md §9 (Proposed solution) + §10 D2 (hand-rolled use(promise) rationale).
 */

import type { HocuspocusProvider, onCloseParameters } from '@hocuspocus/provider';

export const SYNC_TIMEOUT_MS = 30_000;

export class SyncTimeoutError extends Error {
  readonly docName: string;
  readonly elapsedMs: number;
  constructor(docName: string, elapsedMs: number) {
    super(`Sync timed out for "${docName}" after ${elapsedMs}ms`);
    this.name = 'SyncTimeoutError';
    this.docName = docName;
    this.elapsedMs = elapsedMs;
  }
}

export class PreSyncDisconnectError extends Error {
  readonly docName: string;
  constructor(docName: string) {
    super(`Provider disconnected before sync for "${docName}"`);
    this.name = 'PreSyncDisconnectError';
    this.docName = docName;
  }
}

interface CacheEntry {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  createdAt: number;
  timeoutHandle: ReturnType<typeof setTimeout>;
  provider: HocuspocusProvider;
  onSynced: () => void;
  onClose: (data: onCloseParameters) => void;
  settled: boolean;
}

const cache = new Map<string, CacheEntry>();

function detach(entry: CacheEntry): void {
  clearTimeout(entry.timeoutHandle);
  try {
    entry.provider.off('synced', entry.onSynced);
  } catch {
    // provider may already be destroyed; ignore
  }
  try {
    entry.provider.off('close', entry.onClose);
  } catch {
    // ignore
  }
}

/**
 * Returns the cached promise for `docName`, creating one if absent.
 *
 * The promise resolves when the given provider next emits `synced`, rejects
 * with `PreSyncDisconnectError` if the provider emits `close` before `synced`,
 * and rejects with `SyncTimeoutError` after 30s. Call `invalidateSyncPromise`
 * to tear down without rejecting.
 */
export function syncPromise(docName: string, provider: HocuspocusProvider): Promise<void> {
  const existing = cache.get(docName);
  if (existing) return existing.promise;

  const createdAt = Date.now();
  let resolveFn: () => void = () => {};
  let rejectFn: (error: Error) => void = () => {};
  const promise = new Promise<void>((res, rej) => {
    resolveFn = res;
    rejectFn = rej;
  });

  const onSynced = () => {
    const entry = cache.get(docName);
    if (!entry || entry.settled) return;
    entry.settled = true;
    const elapsed = Date.now() - entry.createdAt;
    console.log(`[syncPromise] ${docName} resolved in ${elapsed}ms`);
    detach(entry);
    cache.delete(docName);
    entry.resolve();
  };

  const onClose = (_data: onCloseParameters) => {
    const entry = cache.get(docName);
    if (!entry || entry.settled) return;
    // If the provider already synced (post-sync disconnect), the cache was
    // cleared in onSynced — this guard is belt-and-suspenders.
    entry.settled = true;
    const error = new PreSyncDisconnectError(docName);
    console.warn(`[syncPromise] ${docName} rejected: ${error.message}`);
    detach(entry);
    cache.delete(docName);
    entry.reject(error);
  };

  const timeoutHandle = setTimeout(() => {
    const entry = cache.get(docName);
    if (!entry || entry.settled) return;
    entry.settled = true;
    const elapsed = Date.now() - entry.createdAt;
    const error = new SyncTimeoutError(docName, elapsed);
    console.warn(`[syncPromise] ${docName} rejected: ${error.message}`);
    detach(entry);
    cache.delete(docName);
    entry.reject(error);
  }, SYNC_TIMEOUT_MS);

  const entry: CacheEntry = {
    promise,
    resolve: resolveFn,
    reject: rejectFn,
    createdAt,
    timeoutHandle,
    provider,
    onSynced,
    onClose,
    settled: false,
  };

  // Attach last so an immediate synchronous `synced` emission during `on()`
  // sees the entry in cache.
  provider.on('synced', onSynced);
  provider.on('close', onClose);
  cache.set(docName, entry);

  return promise;
}

/**
 * Remove the cached entry for `docName` without settling the promise. Called
 * from ProviderPool on destroy/recycle so the next `syncPromise(docName, provider)`
 * call returns a fresh promise bound to the replacement provider.
 *
 * Any pending consumer that holds the old promise via `use()` will not see it
 * settle — that consumer should have unmounted (Suspense fallback / Error boundary)
 * by the time invalidation runs.
 */
export function invalidateSyncPromise(docName: string): void {
  const entry = cache.get(docName);
  if (!entry) return;
  entry.settled = true;
  detach(entry);
  cache.delete(docName);
}

/**
 * Test-only helper: clear all cached entries. Exported for unit tests that
 * need a clean slate between cases without discarding the pool state.
 */
export function __resetSyncPromiseCache(): void {
  for (const entry of cache.values()) {
    entry.settled = true;
    detach(entry);
  }
  cache.clear();
}

/**
 * Test-only helper: report cache size. Exported for unit tests.
 */
export function __syncPromiseCacheSize(): number {
  return cache.size;
}
