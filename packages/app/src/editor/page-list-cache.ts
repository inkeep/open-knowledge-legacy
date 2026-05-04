export interface PageListCacheSnapshot {
  readonly pages: ReadonlySet<string>;
  readonly folderPaths: ReadonlySet<string>;
  readonly assetPaths?: ReadonlySet<string>;
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
