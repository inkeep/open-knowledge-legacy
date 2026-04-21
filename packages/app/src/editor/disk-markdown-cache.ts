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
      console.warn('[disk-markdown-cache] fetch failed for', docName, err);
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
 * Invalidate a cached entry. Called when the file-watcher signals a disk
 * change (not yet wired — follow-up). Also used by the test harness.
 */
export function invalidateDiskMarkdown(docName: string): void {
  const hadEntry = state.resolved.delete(docName);
  if (hadEntry) notify();
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

async function defaultFetcher(docName: string): Promise<DiskMarkdownEntry | null> {
  if (typeof fetch === 'undefined') return null;
  const url = `/api/document-disk?docName=${encodeURIComponent(docName)}`;
  const res = await fetch(url, {
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
  if (!res.ok) return null;
  const body = (await res.json()) as
    | { ok: true; docName: string; content: string; sizeBytes: number; mtime: number }
    | { ok: false; error: string };
  if (!('ok' in body) || !body.ok) return null;
  return { markdown: body.content, mtime: body.mtime, sizeBytes: body.sizeBytes };
}
