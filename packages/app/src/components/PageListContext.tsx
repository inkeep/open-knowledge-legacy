import { createContext, type ReactNode, use, useEffect, useState } from 'react';

interface PageListContextValue {
  /** Set of known docNames (filename without .md extension). */
  pages: Set<string>;
  /** True while the page list is being fetched from the server. */
  loading: boolean;
  /** Error message from the most recent fetch failure, or null on success. */
  error: string | null;
  /** Re-fetch the page list from the server. Call after creating a new page. */
  refetch: () => void;
}

const PageListContext = createContext<PageListContextValue>({
  pages: new Set(),
  loading: true,
  error: null,
  refetch: () => {},
});

async function loadPages(): Promise<Set<string>> {
  const r = await fetch('/api/pages');
  if (!r.ok) {
    throw new Error(`/api/pages responded with ${r.status}`);
  }
  const data = (await r.json()) as { ok?: boolean; pages?: Array<{ docName: string }> };
  if (Array.isArray(data.pages)) {
    return new Set(data.pages.map((p) => p.docName));
  }
  return new Set();
}

function logLoadPagesError(err: unknown) {
  console.error('[PageListContext] Failed to load pages:', err);
}

export function PageListProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function refetch() {
    setLoading(true);
    void loadPages()
      .then((p) => {
        setPages(p);
        setError(null);
      })
      .catch((err) => {
        logLoadPagesError(err);
        setError(err instanceof Error ? err.message : 'Failed to load pages');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: run only on mount
  useEffect(() => {
    void refetch();
  }, []);

  return <PageListContext value={{ pages, loading, error, refetch }}>{children}</PageListContext>;
}

export function usePageList(): PageListContextValue {
  const ctx = use(PageListContext);
  if (!ctx) {
    throw new Error('usePageList must be used within <PageListProvider />');
  }
  return ctx;
}
