import { createContext, type ReactNode, use, useEffect, useState } from 'react';

interface PageListContextValue {
  /** Set of known docNames (filename without .md extension). */
  pages: Set<string>;
  /** Re-fetch the page list from the server. Call after creating a new page. */
  refetch: () => void;
}

const PageListContext = createContext<PageListContextValue>({
  pages: new Set(),
  refetch: () => {},
});

async function loadPages(): Promise<Set<string>> {
  const r = await fetch('/api/pages');
  const data = (await r.json()) as { pages?: Array<{ docName: string }> };
  if (Array.isArray(data.pages)) {
    return new Set(data.pages.map((p) => p.docName));
  }
  return new Set();
}

export function PageListProvider({ children }: { children: ReactNode }) {
  const [pages, setPages] = useState<Set<string>>(new Set());

  function refetch() {
    loadPages()
      .then(setPages)
      .catch(() => {});
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch captures only stable setPages
  useEffect(() => {
    refetch();
  }, []);

  return <PageListContext value={{ pages, refetch }}>{children}</PageListContext>;
}

export function usePageList(): PageListContextValue {
  return use(PageListContext);
}
