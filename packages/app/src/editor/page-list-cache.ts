/**
 * Page-list side-channel for plain-DOM chip consumers (V2 §FR5/FR6 / US-005).
 *
 * InternalLink + WikiLink chips render via renderHTML (PM layer, no React
 * context access). They still need live resolution-state classification —
 * `pages: Set<string>` + `folderPaths: Set<string>` — normally provided by
 * <PageListProvider /> via React context + usePageList().
 *
 * This module is the bridge:
 * - PageListProvider calls setPageListCache({pages, folderPaths}) on value change.
 * - Chip PM plugins call subscribePageListCache(fn) to dispatch decoration refresh
 *   when page list mutates; they read via getPageListCache() inside decorations(state).
 *
 * Design notes
 * ------------
 * - Change detection via Set-content equality so render-frequent setPageListCache
 *   calls with stable content don't storm subscribers. Single writer (provider);
 *   many readers (PM plugins). No locking required — React renders and PM plugin
 *   dispatches both run on the main thread synchronously.
 * - Reads are synchronous + cheap. Subscribers receive the snapshot on invocation
 *   so they don't need a separate getPageListCache() call.
 * - DEV-only `window.__okPageListCache` write (gated on import.meta.env?.DEV per
 *   the repo's DEV-gated test-hook convention — precedent #20(b)). Debug-visible
 *   in devtools; stripped in production bundles.
 *
 * Scope carve-outs
 * ----------------
 * - This module is purely a store. The PageListProvider → setPageListCache
 *   wiring lives in `PageListContext.tsx` (iter-25; a useEffect that publishes
 *   {pages, folderPaths} on every render — no-ops absorbed by the equality gate).
 * - Consumer renderDecorationRefresh is a separate concern (the PM plugin in
 *   internal-link.ts will subscribe here and dispatch a transaction carrying
 *   a custom meta to force mark-identity-decoration-plugin re-run).
 *
 * @see packages/app/src/editor/extensions/mark-identity-decoration-plugin.ts — iter-20
 * @see packages/app/src/editor/extensions/mark-interaction-bridge.ts — iter-21
 * @see specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/SPEC.md §FR5/FR6
 */

export interface PageListCacheSnapshot {
  readonly pages: ReadonlySet<string>;
  readonly folderPaths: ReadonlySet<string>;
}

type CacheListener = (snapshot: PageListCacheSnapshot) => void;

let currentSnapshot: PageListCacheSnapshot | null = null;
const listeners = new Set<CacheListener>();

/**
 * Returns true when two sets contain exactly the same members (order-independent).
 * O(n) — single pass after the cheap size comparison fails fast.
 */
export function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

/**
 * Pure helper — returns true when prev and next represent the same cache state
 * (same pages set content AND same folderPaths set content). Used by
 * setPageListCache to gate notify() and by tests.
 */
export function snapshotsEqual(
  prev: PageListCacheSnapshot | null,
  next: PageListCacheSnapshot,
): boolean {
  if (prev === null) return false;
  if (prev === next) return true;
  return setsEqual(prev.pages, next.pages) && setsEqual(prev.folderPaths, next.folderPaths);
}

/**
 * Synchronous accessor. Returns null until the first setPageListCache call
 * (which lands when PageListProvider first mounts and resolves /api/pages).
 * Consumers MUST handle the null case (treat as "all targets unresolved").
 */
export function getPageListCache(): PageListCacheSnapshot | null {
  return currentSnapshot;
}

/**
 * Writer. Replaces the current snapshot and notifies subscribers ONLY when the
 * content actually changed (Set-wise deep-equal). Idempotent when called with a
 * content-equal snapshot — safe to invoke on every React render.
 */
export function setPageListCache(snapshot: PageListCacheSnapshot): void {
  if (snapshotsEqual(currentSnapshot, snapshot)) return;
  currentSnapshot = snapshot;
  // Debug hook — tree-shaken out of production bundles per precedent #20(b).
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    (window as unknown as { __okPageListCache?: PageListCacheSnapshot }).__okPageListCache =
      snapshot;
  }
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (err) {
      // Subscriber throw MUST NOT abort sibling notifications. Single writer + many
      // readers means a bad plugin can't take down the provider.
      console.error('[page-list-cache] subscriber threw:', err);
    }
  }
}

/**
 * Register a listener that fires once immediately with the current snapshot
 * (if one exists) AND on every subsequent content change. Returns an unsubscribe
 * function. Safe to call `unsubscribe()` inside a listener (iteration is over
 * a copy of the Set).
 *
 * Firing-immediately-on-subscribe means PM plugins don't need a companion
 * getPageListCache() call — they receive the current state as part of the
 * subscribe result. If the cache is null at subscribe time, the listener is
 * NOT called until the first setPageListCache.
 */
export function subscribePageListCache(listener: CacheListener): () => void {
  listeners.add(listener);
  if (currentSnapshot !== null) {
    try {
      listener(currentSnapshot);
    } catch (err) {
      console.error('[page-list-cache] subscriber threw on replay:', err);
    }
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Test helper — resets the module to its initial state. Safe to call from
 * beforeEach/afterEach in unit tests so no state leaks across cases. Not
 * exported from the public barrel; imported directly by the colocated test.
 */
export function __resetPageListCacheForTests(): void {
  currentSnapshot = null;
  listeners.clear();
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    delete (window as unknown as { __okPageListCache?: PageListCacheSnapshot }).__okPageListCache;
  }
}
