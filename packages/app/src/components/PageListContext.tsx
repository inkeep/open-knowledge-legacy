import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { deriveKnownFolderPaths } from './navigation-targets';

export interface PageMeta {
  size: number;
  modified: string;
}

interface PageListContextValue {
  /** Set of known docNames (filename without .md extension). */
  pages: Set<string>;
  /** Display titles returned by `/api/pages`, keyed by docName. */
  pageTitles: ReadonlyMap<string, string>;
  /** File metadata (size, modified) returned by `/api/pages`, keyed by docName. */
  pageMeta: ReadonlyMap<string, PageMeta>;
  /** Set of known folder paths derived from the current document list. */
  folderPaths: Set<string>;
  /** True while the page list is being fetched from the server. */
  loading: boolean;
  /** Error message from the most recent fetch failure, or null on success. */
  error: string | null;
  /** Re-fetch the page list from the server. Call after creating a new page. */
  refetch: () => void;
  /** Optimistically mark a page as present before watcher/index propagation settles. */
  addPage: (docName: string) => void;
}

const PageListContext = createContext<PageListContextValue | null>(null);

interface PageSummary {
  docName: string;
  title: string;
  size: number;
  modified: string;
}

export function mergePageSets(
  serverPages: ReadonlySet<string>,
  optimisticPages: ReadonlySet<string>,
) {
  if (optimisticPages.size === 0) return new Set(serverPages);
  const merged = new Set(serverPages);
  for (const docName of optimisticPages) merged.add(docName);
  return merged;
}

export function pruneConfirmedOptimisticPages(
  optimisticPages: ReadonlySet<string>,
  serverPages: ReadonlySet<string>,
) {
  if (optimisticPages.size === 0) return new Set<string>();
  const pending = new Set<string>();
  for (const docName of optimisticPages) {
    if (!serverPages.has(docName)) pending.add(docName);
  }
  return pending;
}

function mergePageTitles(
  serverTitles: ReadonlyMap<string, string>,
  optimisticPages: ReadonlySet<string>,
) {
  const merged = new Map(serverTitles);
  for (const docName of optimisticPages) {
    if (!merged.has(docName)) {
      merged.set(docName, docName);
    }
  }
  return merged;
}

async function loadPages(): Promise<PageSummary[]> {
  const r = await fetch('/api/pages');
  if (!r.ok) {
    throw new Error(`/api/pages responded with ${r.status}`);
  }
  const data = (await r.json()) as { ok?: boolean; pages?: PageSummary[] };
  if (Array.isArray(data.pages)) {
    return data.pages;
  }
  return [];
}

function logLoadPagesError(err: unknown) {
  console.error('[PageListContext] Failed to load pages:', err);
}

export function PageListProvider({ children }: { children: ReactNode }) {
  const [serverPages, setServerPages] = useState(new Set<string>());
  const [serverPageTitles, setServerPageTitles] = useState(new Map<string, string>());
  const [serverPageMeta, setServerPageMeta] = useState(new Map<string, PageMeta>());
  const [optimisticPages, setOptimisticPages] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latestRequestIdRef = useRef(0);

  function refetch() {
    const requestId = ++latestRequestIdRef.current;
    setLoading(true);
    void loadPages()
      .then((pageSummaries) => {
        if (requestId !== latestRequestIdRef.current) return;
        const pageNames = new Set(pageSummaries.map((page) => page.docName));
        setServerPages(pageNames);
        setServerPageTitles(
          new Map(pageSummaries.map((page) => [page.docName, page.title] as const)),
        );
        setServerPageMeta(
          new Map(
            pageSummaries.map(
              (page) => [page.docName, { size: page.size, modified: page.modified }] as const,
            ),
          ),
        );
        setOptimisticPages((prev) => pruneConfirmedOptimisticPages(prev, pageNames));
        setError(null);
      })
      .catch((err) => {
        if (requestId !== latestRequestIdRef.current) return;
        logLoadPagesError(err);
        setError(err instanceof Error ? err.message : 'Failed to load pages');
      })
      .finally(() => {
        if (requestId !== latestRequestIdRef.current) return;
        setLoading(false);
      });
  }

  function addPage(docName: string) {
    setOptimisticPages((prev) => {
      if (prev.has(docName)) return prev;
      const next = new Set(prev);
      next.add(docName);
      return next;
    });
    setError(null);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only on mount
  useEffect(() => {
    void refetch();
    const handleResume = () => {
      if (document.visibilityState === 'visible') {
        refetch();
      }
    };
    window.addEventListener('focus', handleResume);
    window.addEventListener('visibilitychange', handleResume);
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files')) {
        refetch();
      }
    });
    return () => {
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('visibilitychange', handleResume);
      unsubscribe();
    };
  }, []);

  const pages = mergePageSets(serverPages, optimisticPages);
  const pageTitles = mergePageTitles(serverPageTitles, optimisticPages);
  const pageMeta: ReadonlyMap<string, PageMeta> = serverPageMeta;
  const folderPaths = deriveKnownFolderPaths(pages);

  return (
    <PageListContext
      value={{ pages, pageTitles, pageMeta, folderPaths, loading, error, refetch, addPage }}
    >
      {children}
    </PageListContext>
  );
}

export function usePageList(): PageListContextValue {
  const ctx = use(PageListContext);
  if (!ctx) {
    throw new Error('usePageList must be used within <PageListProvider />');
  }
  return ctx;
}
