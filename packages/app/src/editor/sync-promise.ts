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
import { mark } from '@/lib/perf';

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

export class DocumentNotFoundError extends Error {
  readonly docName: string;
  constructor(docName: string) {
    super(`Document not found: "${docName}"`);
    this.name = 'DocumentNotFoundError';
    this.docName = docName;
  }
}

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

export class ServerCapabilityMismatchError extends Error {
  readonly docName: string;
  readonly missingCapability: string;
  constructor(docName: string, missingCapability: string) {
    super(`Server is missing capability "${missingCapability}" required to open "${docName}".`);
    this.name = 'ServerCapabilityMismatchError';
    this.docName = docName;
    this.missingCapability = missingCapability;
  }
}

interface CacheEntry {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  createdAt: number;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  provider: HocuspocusProvider;
  onSynced: () => void;
  onClose: (data: onCloseParameters) => void;
  settled: boolean;
  resolved: boolean;
  detached: boolean;
}

const cache = new Map<string, CacheEntry>();

let visibilityHandlerInstalled = false;

function hasPendingEntries(): boolean {
  for (const entry of cache.values()) {
    if (!entry.settled) return true;
  }
  return false;
}

function checkTimeoutsOnVisible(): void {
  if (typeof document === 'undefined') return;
  if (document.visibilityState !== 'visible') return;
  __reapTimedOutEntries(Date.now());
}

export function __reapTimedOutEntries(now: number): number {
  const reaped: Array<{ docName: string; elapsedMs: number }> = [];
  for (const [docName, entry] of cache) {
    if (entry.settled) continue;
    const elapsed = now - entry.createdAt;
    if (elapsed < SYNC_TIMEOUT_MS) continue;
    entry.settled = true;
    const error = new SyncTimeoutError(docName, elapsed);
    detach(entry);
    entry.reject(error);
    reaped.push({ docName, elapsedMs: elapsed });
  }
  if (reaped.length > 0) {
    const summary = reaped.map((r) => `${r.docName} (${r.elapsedMs}ms)`).join(', ');
    console.warn(
      `[syncPromise] reaped ${reaped.length} timed-out ${
        reaped.length === 1 ? 'entry' : 'entries'
      } on visibility restore (tab-sleep recovered): ${summary}`,
    );
  }
  if (!hasPendingEntries()) uninstallVisibilityHandler();
  return reaped.length;
}

function installVisibilityHandler(): void {
  if (visibilityHandlerInstalled) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', checkTimeoutsOnVisible);
  visibilityHandlerInstalled = true;
}

function uninstallVisibilityHandler(): void {
  if (!visibilityHandlerInstalled) return;
  if (typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', checkTimeoutsOnVisible);
  visibilityHandlerInstalled = false;
}

const armedRejections = new Map<string, 'timeout' | 'predisconnect'>();

function detach(entry: CacheEntry): void {
  if (entry.detached) return;
  entry.detached = true;
  if (entry.timeoutHandle !== null) clearTimeout(entry.timeoutHandle);
  entry.provider.off('synced', entry.onSynced);
  entry.provider.off('close', entry.onClose);
}

export function syncPromise(docName: string, provider: HocuspocusProvider): Promise<void> {
  const existing = cache.get(docName);
  if (existing) return existing.promise;

  const armed = armedRejections.get(docName);
  if (armed !== undefined) {
    armedRejections.delete(docName);
    const error =
      armed === 'timeout' ? new SyncTimeoutError(docName, 0) : new PreSyncDisconnectError(docName);
    console.warn(
      `[syncPromise] ${docName} rejected on creation (test hook, armed ${armed}): ${error.message}`,
    );
    mark('ok/sync/create', { docName, warm: false, armed });
    mark('ok/sync/reject', { docName, reason: `armed-${armed}` });
    const promise = createRejectedThenable<void>(error);
    cache.set(docName, makeRejectedSentinelEntry(promise, provider));
    return promise;
  }

  if (provider.synced) {
    console.log(`[syncPromise] ${docName} resolved synchronously (warm provider)`);
    mark('ok/sync/create', { docName, warm: true });
    mark('ok/sync/resolve', { docName, elapsedMs: 0, warm: true });
    const promise = Promise.resolve();
    cache.set(docName, makeSentinelEntry(promise, provider));
    return promise;
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
    entry.resolved = true;
    const elapsed = Date.now() - entry.createdAt;
    console.log(`[syncPromise] ${docName} resolved in ${elapsed}ms`);
    mark('ok/sync/resolve', { docName, elapsedMs: elapsed, warm: false });
    detach(entry);
    if (!hasPendingEntries()) uninstallVisibilityHandler();
    entry.resolve();
  };

  const onClose = (_data: onCloseParameters) => {
    const entry = cache.get(docName);
    if (!entry || entry.settled) return;
    entry.settled = true;
    const error = new PreSyncDisconnectError(docName);
    console.warn(`[syncPromise] ${docName} rejected: ${error.message}`);
    mark('ok/sync/reject', { docName, reason: 'pre-sync-disconnect' });
    detach(entry);
    if (!hasPendingEntries()) uninstallVisibilityHandler();
    entry.reject(error);
  };

  const timeoutHandle = setTimeout(() => {
    const entry = cache.get(docName);
    if (!entry || entry.settled) return;
    entry.settled = true;
    const elapsed = Date.now() - entry.createdAt;
    const error = new SyncTimeoutError(docName, elapsed);
    console.warn(`[syncPromise] ${docName} rejected: ${error.message}`);
    mark('ok/sync/reject', { docName, reason: 'timeout', elapsedMs: elapsed });
    detach(entry);
    if (!hasPendingEntries()) uninstallVisibilityHandler();
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
    resolved: false,
    detached: false,
  };

  cache.set(docName, entry);
  provider.on('synced', onSynced);
  provider.on('close', onClose);

  installVisibilityHandler();

  mark('ok/sync/create', { docName, warm: false });

  return promise;
}

function makeSentinelEntry(promise: Promise<void>, provider: HocuspocusProvider): CacheEntry {
  return {
    promise,
    resolve: () => {},
    reject: () => {},
    createdAt: Date.now(),
    timeoutHandle: null,
    provider,
    onSynced: () => {},
    onClose: () => {},
    settled: true,
    resolved: true,
    detached: true,
  };
}

function createRejectedThenable<T>(error: Error): Promise<T> {
  const settled = Promise.reject(error) as Promise<T>;
  settled.catch(() => {});
  const thenable = settled as unknown as Promise<T> & {
    status: 'rejected';
    reason: Error;
  };
  thenable.status = 'rejected';
  thenable.reason = error;
  return thenable;
}

function makeRejectedSentinelEntry(
  promise: Promise<void>,
  provider: HocuspocusProvider,
): CacheEntry {
  return {
    promise,
    resolve: () => {},
    reject: () => {},
    createdAt: Date.now(),
    timeoutHandle: null,
    provider,
    onSynced: () => {},
    onClose: () => {},
    settled: true,
    resolved: false,
    detached: true,
  };
}

export function syncPromiseHasResolved(docName: string): boolean {
  return cache.get(docName)?.resolved === true;
}

export function invalidateSyncPromise(docName: string): void {
  const entry = cache.get(docName);
  if (!entry) return;
  entry.settled = true;
  detach(entry);
  cache.delete(docName);
  if (!hasPendingEntries()) uninstallVisibilityHandler();
}

export function rejectSyncPromise(docName: string, error: Error): boolean {
  const entry = cache.get(docName);
  if (!entry || entry.settled) return false;
  entry.settled = true;
  console.warn(`[syncPromise] ${docName} rejected: ${error.message}`);
  detach(entry);
  if (!hasPendingEntries()) uninstallVisibilityHandler();
  entry.reject(error);
  return true;
}

export function __resetSyncPromiseCache(): void {
  for (const entry of cache.values()) {
    entry.settled = true;
    detach(entry);
  }
  cache.clear();
  armedRejections.clear();
  uninstallVisibilityHandler();
}

export function __syncPromiseSettled(docName: string): boolean {
  return cache.get(docName)?.settled ?? false;
}

export function __syncPromiseCacheSize(): number {
  return cache.size;
}

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
  if (!hasPendingEntries()) uninstallVisibilityHandler();
  entry.reject(error);
  return true;
}

export function __test_armPendingRejection(
  docName: string,
  kind: 'timeout' | 'predisconnect' = 'timeout',
): void {
  armedRejections.set(docName, kind);
  console.warn(`[syncPromise] ${docName} armed for rejection on next creation (kind=${kind})`);
}

export function __test_clearArmedRejection(docName: string): boolean {
  return armedRejections.delete(docName);
}
