/**
 * Module-level cache for `/api/document-disk` fetches. Powers the Suspense
 * fallback path (review Major #7): the fallback renders synchronously —
 * `<Suspense fallback>` cannot itself suspend — so we expose a synchronous
 * `getDiskMarkdown(docName)` that returns the cached bytes if fetched, or
 * null while in-flight.
 *
 * The background fetch kicks off the first time a component calls
 * `getDiskMarkdown`; subsequent renders synchronously see the resolved
 * value. On navigation to a new doc, the cache is NOT invalidated — disk
 * bytes are fine to reuse across cold loads of the same doc (the editor's
 * syncPromise is the authoritative source once it resolves; disk is just
 * the pre-sync paint target).
 *
 * Listeners are notified when a docName's value transitions from "not
 * fetched" to "fetched" so a `useSyncExternalStore` consumer can re-render
 * once bytes arrive. No polling — the fetch's `then` fires the notify.
 */

import { mark } from '@/lib/perf';

export interface DiskMarkdownEntry {
  markdown: string;
  mtime: number;
  /** Byte size reported by the server; useful for telemetry. */
  sizeBytes: number;
}

interface CacheState {
  /** Docname → resolved entry. Missing means "no bytes yet". */
  resolved: Map<string, DiskMarkdownEntry>;
  /** Docname → in-flight promise. Missing means "not yet fetched". */
  inflight: Map<string, Promise<DiskMarkdownEntry | null>>;
  listeners: Set<() => void>;
}

const state: CacheState = {
  resolved: new Map(),
  inflight: new Map(),
  listeners: new Set(),
};

function notify(): void {
  for (const l of [...state.listeners]) {
    try {
      l();
    } catch (err) {
      console.error('[disk-markdown-cache] listener threw:', err);
    }
  }
}

/**
 * Synchronous accessor. Returns the cached entry if a previous fetch
 * resolved, or null while the fetch is in-flight / hasn't started.
 *
 * Triggering a fetch is NOT a side effect of this accessor — callers who
 * want to ensure a doc is fetched must call `primeDiskMarkdown(docName)`
 * explicitly (typically from a React effect).
 */
export function getDiskMarkdown(docName: string): DiskMarkdownEntry | null {
  return state.resolved.get(docName) ?? null;
}

/**
 * Start fetching disk markdown for `docName` if no fetch is in-flight and
 * no cached entry exists. Idempotent — concurrent calls return the same
 * Promise. Resolves with the entry (or null on fetch failure).
 */
export function primeDiskMarkdown(docName: string): Promise<DiskMarkdownEntry | null> {
  const existing = state.inflight.get(docName);
  if (existing) return existing;
  if (state.resolved.has(docName)) {
    return Promise.resolve(state.resolved.get(docName) ?? null);
  }
  const promise = fetchDiskMarkdown(docName)
    .then((entry) => {
      if (entry) {
        state.resolved.set(docName, entry);
        notify();
      }
      return entry;
    })
    .catch((err) => {
      // `defaultFetcher` emits structured `ok/disk-cache/fetch-failed`
      // for every failure path it can classify (review Pass-2 Minor #1).
      // This catch covers synchronous throws from non-default fetchers
      // (tests that stub the fetcher without proper Promise hygiene).
      emitFetchFailure(docName, 'network-error');
      // `err` is intentionally only inspected for TimeoutError via
      // `defaultFetcher`; here we've lost type info, so we drop it.
      void err;
      return null;
    })
    .finally(() => {
      state.inflight.delete(docName);
    });
  state.inflight.set(docName, promise);
  return promise;
}

/**
 * Subscribe for cache changes. Returns an unsubscribe function. Useful for
 * `useSyncExternalStore`-style consumers in the fallback render path so
 * they re-render when the disk bytes arrive.
 */
export function subscribeDiskMarkdown(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

/**
 * Invalidate a cached entry for a specific doc. Used by call-sites that
 * know the exact docName that mutated (e.g. direct optimistic rename).
 * Also used by the test harness.
 */
export function invalidateDiskMarkdown(docName: string): void {
  const hadEntry = state.resolved.delete(docName);
  if (hadEntry) notify();
}

/**
 * Clear every cached entry. Called by `SystemDocSubscriber` on every CC1
 * `'files'` signal — the channel fires on any create/delete/rename/external
 * update from the file-watcher and we don't get a per-doc signal at the
 * CC1 layer (see `packages/server/src/cc1-broadcast.ts` — the contract is
 * `{v, ch, seq}` with no docName). Clearing aggressively is the correct
 * behavior: disk bytes are only read once per cold-load, a refetch after
 * any file mutation is cheaper than a stale paint of pre-rename / pre-
 * delete / pre-external-edit contents.
 *
 * Review Pass-2 Major #3 wiring — pre-fix, `invalidateDiskMarkdown` was
 * exported but had no production caller, so a teammate's `git checkout`
 * / agent `/api/agent-write-md` / external editor save would leave the
 * Suspense fallback painting pre-mutation bytes until the cache grew
 * past natural turnover.
 */
export function clearDiskMarkdownCache(): void {
  const hadAny = state.resolved.size > 0;
  state.resolved.clear();
  if (hadAny) notify();
}

/** Test-only: reset the module to initial state. */
export function __resetDiskMarkdownCacheForTests(): void {
  state.resolved.clear();
  state.inflight.clear();
  state.listeners.clear();
}

// ---------------------------------------------------------------------------
// Network — exported so tests can override without touching `fetch` globally.
// ---------------------------------------------------------------------------

export type DiskMarkdownFetcher = (docName: string) => Promise<DiskMarkdownEntry | null>;

let _fetcher: DiskMarkdownFetcher = defaultFetcher;

/** Test-only: override the fetcher. */
export function __setDiskMarkdownFetcher(f: DiskMarkdownFetcher | null): void {
  _fetcher = f ?? defaultFetcher;
}

async function fetchDiskMarkdown(docName: string): Promise<DiskMarkdownEntry | null> {
  return _fetcher(docName);
}

type FetchFailureKind =
  | 'no-fetch-global'
  | 'timeout'
  | 'network-error'
  | 'symlink-escape'
  | 'not-found'
  | 'too-large'
  | 'reserved-name'
  | 'server-error'
  | 'body-parse-error'
  | 'unknown-http-status'
  | 'response-error-shape';

function emitFetchFailure(docName: string, kind: FetchFailureKind, status?: number): void {
  // Structured telemetry so ops tooling can bucket by failure kind instead
  // of relying on free-text `console.warn` — review Pass-2 Minor #1.
  mark('ok/disk-cache/fetch-failed', { docName, kind, status: status ?? -1 });
}

async function defaultFetcher(docName: string): Promise<DiskMarkdownEntry | null> {
  if (typeof fetch === 'undefined') {
    emitFetchFailure(docName, 'no-fetch-global');
    return null;
  }
  const url = `/api/document-disk?docName=${encodeURIComponent(docName)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      // The Suspense-fallback path wants a quick paint — if disk bytes take
      // longer than the syncPromise to arrive, the editor mounts first and
      // the fallback is never shown. An explicit 3s abort is defensive
      // against a wedged server; the fallback just renders EditorSkeleton
      // if bytes don't arrive in time.
      signal:
        typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.timeout(3_000)
          : undefined,
    });
  } catch (err) {
    // AbortSignal.timeout surfaces as DOMException with name 'TimeoutError'
    // in browsers that implement it strictly; everywhere else we see a
    // generic network error. Classify via duck-typing on the name.
    const name = (err as { name?: string } | null)?.name;
    emitFetchFailure(docName, name === 'TimeoutError' ? 'timeout' : 'network-error');
    return null;
  }
  if (!res.ok) {
    // HTTP-level failure — bucket by status so ops can tell a 403 symlink-
    // escape from a 413 oversize from a 500 server error.
    let kind: FetchFailureKind = 'unknown-http-status';
    if (res.status === 403) kind = 'symlink-escape';
    else if (res.status === 404) kind = 'not-found';
    else if (res.status === 413) kind = 'too-large';
    else if (res.status === 400) kind = 'reserved-name';
    else if (res.status >= 500) kind = 'server-error';
    emitFetchFailure(docName, kind, res.status);
    return null;
  }
  let body:
    | { ok: true; docName: string; content: string; sizeBytes: number; mtime: number }
    | { ok: false; error: string };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    emitFetchFailure(docName, 'body-parse-error', res.status);
    return null;
  }
  if (!('ok' in body) || !body.ok) {
    emitFetchFailure(docName, 'response-error-shape', res.status);
    return null;
  }
  return { markdown: body.content, mtime: body.mtime, sizeBytes: body.sizeBytes };
}
