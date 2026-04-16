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

/**
 * Document lookup failed (not yet surfaced by the current sync pipeline — reserved
 * so the error-boundary copy taxonomy is complete and future sync paths can throw
 * a typed instance instead of a generic Error).
 */
export class DocumentNotFoundError extends Error {
  readonly docName: string;
  constructor(docName: string) {
    super(`Document not found: "${docName}"`);
    this.name = 'DocumentNotFoundError';
    this.docName = docName;
  }
}

/**
 * Bridge setup failed during `setupObservers` initialization in `ProviderPool`.
 * Surfaced through the syncPromise so the user gets a deterministic error UI
 * (DocumentErrorBoundary's "Try again") instead of a silent fall-back to the
 * "Select a document" empty state. Without this, an init throw would close the
 * provider, null out `activeDocName`, and leave the user with no signal about
 * what happened or what to do next.
 */
export class BridgeSetupError extends Error {
  readonly docName: string;
  readonly cause?: unknown;
  constructor(docName: string, cause?: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause ?? 'unknown');
    super(`Bridge setup failed for "${docName}": ${causeMsg}`);
    this.name = 'BridgeSetupError';
    this.docName = docName;
    this.cause = cause;
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
  // HocuspocusProvider extends EventEmitter whose `off()` short-circuits when
  // no callbacks are registered (verified at @hocuspocus/provider/src/EventEmitter.ts).
  // After destroy(), `removeAllListeners()` empties the callback map, so a
  // subsequent off() is a safe no-op. No try/catch needed — if off() throws,
  // something is structurally wrong and the noise should surface.
  entry.provider.off('synced', entry.onSynced);
  entry.provider.off('close', entry.onClose);
}

/**
 * Returns the cached promise for `docName`, creating one if absent.
 *
 * The promise resolves when the given provider next emits `synced`, rejects
 * with `PreSyncDisconnectError` if the provider emits `close` before `synced`,
 * and rejects with `SyncTimeoutError` after 30s. Call `invalidateSyncPromise`
 * to tear down without rejecting.
 *
 * **Warm-provider fast path:** if the provider has already synced (e.g.
 * pool-resident from a prior mount), `provider.synced` is true and the
 * `'synced'` event has already fired and will not fire again — Hocuspocus's
 * `set synced(value)` is a no-op when the value is unchanged
 * (`@hocuspocus/provider/src/HocuspocusProvider.ts:387-397`). Returning a
 * pre-resolved promise here is what makes the "cold mount, warm content" path
 * (precedent #15(c), spec G1+G5) actually instant — without this gate, every
 * Activity-evicted-but-pool-resident revisit would hang for 30s waiting on a
 * listener that can never fire.
 */
export function syncPromise(docName: string, provider: HocuspocusProvider): Promise<void> {
  const existing = cache.get(docName);
  if (existing) return existing.promise;

  if (provider.synced) {
    console.log(`[syncPromise] ${docName} resolved synchronously (warm provider)`);
    return Promise.resolve();
  }

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

  // Cache first, then attach listeners — so any synchronously-fired callback
  // can find the entry via `cache.get(docName)`. EventEmitter.on() does not
  // emit past events, so this ordering is currently belt-and-suspenders, but
  // making it explicit keeps the invariant safe against future provider
  // implementations that might change that contract.
  cache.set(docName, entry);
  provider.on('synced', onSynced);
  provider.on('close', onClose);

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
 * Reject the cached syncPromise for `docName` with a specific error. Used by
 * `ProviderPool` to surface deterministic init failures (e.g. `BridgeSetupError`
 * from `setupObservers`) through the React error boundary instead of silently
 * tearing down. No-op if no entry exists.
 *
 * Returns true if an entry was rejected, false otherwise.
 */
export function rejectSyncPromise(docName: string, error: Error): boolean {
  const entry = cache.get(docName);
  if (!entry || entry.settled) return false;
  entry.settled = true;
  console.warn(`[syncPromise] ${docName} rejected: ${error.message}`);
  detach(entry);
  cache.delete(docName);
  entry.reject(error);
  return true;
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

/**
 * Test-only helper: force-reject the cached syncPromise for `docName`.
 *
 * Used by Playwright E2E (see packages/app/tests/stress/docs-open.e2e.ts) to
 * exercise DocumentErrorBoundary recovery paths that are otherwise hard to
 * trigger — sync never fires (requires 30s wait) or pre-sync disconnect
 * (requires a real network-level event).
 *
 * Returns `true` if an entry was found and rejected, `false` otherwise.
 *
 * Safe in production: the cache is a local module-level data structure; there
 * is no security boundary crossed by rejecting an entry that a legitimate
 * consumer could simply invalidate via `invalidateSyncPromise`. The helper is
 * exposed so tests can force error-boundary rendering without shipping a
 * dev-only build flag.
 */
export function __rejectSyncPromise(
  docName: string,
  kind: 'timeout' | 'disconnect' = 'timeout',
): boolean {
  const entry = cache.get(docName);
  if (!entry || entry.settled) return false;
  entry.settled = true;
  const elapsed = Date.now() - entry.createdAt;
  const error =
    kind === 'timeout'
      ? new SyncTimeoutError(docName, elapsed)
      : new PreSyncDisconnectError(docName);
  console.warn(`[syncPromise] ${docName} force-rejected (test hook): ${error.message}`);
  detach(entry);
  cache.delete(docName);
  entry.reject(error);
  return true;
}
