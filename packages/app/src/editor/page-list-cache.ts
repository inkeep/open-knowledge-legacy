/**
 * Page-list side-channel for plain-DOM chip consumers (V2 §FR5/FR6 / US-005).
 *
 * InternalLink + WikiLink chips render via renderHTML (PM layer, no React
 * context access). They still need live resolution-state classification —
 * `pages: Set<string>` + `folderPaths: Set<string>` — normally provided by
 * <PageListProvider /> via React context + usePageList().
 *
 * This module is the bridge:
 * - PageListProvider calls setPageListCache({pages, folderPaths, assetPaths}) on value change.
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
 *   a custom meta to force mark-identity-decoration re-run).
 *
 * @see packages/app/src/editor/extensions/mark-identity-decoration.ts — iter-20
 * @see packages/app/src/editor/extensions/mark-interaction-bridge.ts — iter-21
 * @see specs/2026-04-20-perf-v2-editor-cache-and-cold-load-ux/SPEC.md §FR5/FR6
 */

export interface PageListCacheSnapshot {
  readonly pages: ReadonlySet<string>;
  readonly folderPaths: ReadonlySet<string>;
  /** Referenced, renderable assets from `/api/documents`, contentDir-relative. */
  readonly assetPaths?: ReadonlySet<string>;
  /**
   * Slug-keyed index: `toWikiLinkSlug(docName) → original docName`.
   * Populated alongside `pages` by `setPageListCache`. Enables O(1)
   * resolution for wiki-link targets that
   * arrive in slug form (e.g. dropped `.md` → target='readme' via
   * `buildUnresolvedWikiLinkAttrs` / `toWikiLinkSlug`) against
   * case-preserved + non-slug-form cache entries (`README`,
   * `BA_for_Depression_Research`). Handles both case-folding
   * (`README` → `readme`) and separator normalization (`_` / space
   * / punctuation → `-`) in one index. First-wins on slug collision —
   * if both `README.md` and `ReadMe.md` exist, resolver picks the
   * insertion-order-first entry (Map preserves insertion order).
   */
  readonly pagesBySlug: ReadonlyMap<string, string>;
}

type CacheListener = (snapshot: PageListCacheSnapshot) => void;

let currentSnapshot: PageListCacheSnapshot | null = null;
const listeners = new Set<CacheListener>();

export function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

export function snapshotsEqual(
  prev: PageListCacheSnapshot | null,
  next: PageListCacheSnapshot,
): boolean {
  if (prev === null) return false;
  if (prev === next) return true;
  return (
    setsEqual(prev.pages, next.pages) &&
    setsEqual(prev.folderPaths, next.folderPaths) &&
    setsEqual(prev.assetPaths ?? new Set(), next.assetPaths ?? new Set())
  );
}

export function buildPagesBySlugIndex(
  pages: ReadonlySet<string>,
  slugFn: (text: string) => string,
): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const page of pages) {
    const key = slugFn(page);
    if (key && !index.has(key)) index.set(key, page);
  }
  return index;
}

export function getPageListCache(): PageListCacheSnapshot | null {
  return currentSnapshot;
}

export function setPageListCache(snapshot: PageListCacheSnapshot): void {
  if (snapshotsEqual(currentSnapshot, snapshot)) return;
  currentSnapshot = snapshot;
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    (window as unknown as { __okPageListCache?: PageListCacheSnapshot }).__okPageListCache =
      snapshot;
  }
  for (const listener of [...listeners]) {
    try {
      listener(snapshot);
    } catch (err) {
      console.error('[page-list-cache] subscriber threw:', err);
    }
  }
}

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

export function __resetPageListCacheForTests(): void {
  currentSnapshot = null;
  listeners.clear();
  if (typeof window !== 'undefined' && import.meta.env?.DEV) {
    delete (window as unknown as { __okPageListCache?: PageListCacheSnapshot }).__okPageListCache;
  }
}
