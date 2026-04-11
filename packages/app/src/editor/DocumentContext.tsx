import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import { ProviderPool, type SyncState } from './provider-pool';

export interface DocumentContextValue {
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  syncState: SyncState | 'connecting';
  openDocument: (docName: string) => void;
  closeDocument: (docName: string) => void;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const poolRef = useRef<ProviderPool | null>(null);
  if (!poolRef.current) {
    poolRef.current = new ProviderPool(10);
  }
  const pool = poolRef.current;

  // Revision counter — bumped by pool.onChange to trigger React re-render
  const [, setRevision] = useState(0);

  useEffect(() => {
    pool.setOnChange(() => setRevision((r) => r + 1));
    return () => {
      pool.setOnChange(null);
    };
  }, [pool]);

  // Expose pool on window for E2E test access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__providerPool = pool;
      Object.defineProperty(window, '__activeProvider', {
        get: () => pool.getActive()?.provider ?? null,
        configurable: true,
      });
    }
    return () => {
      pool.dispose();
    };
  }, [pool]);

  const activeEntry = pool.getActive();

  const value: DocumentContextValue = {
    activeDocName: pool.getActiveDocName(),
    activeProvider: activeEntry?.provider ?? null,
    syncState: activeEntry?.syncState ?? 'connecting',
    openDocument: (docName: string) => {
      pool.open(docName);
      pool.setActive(docName);
    },
    closeDocument: (docName: string) => {
      pool.close(docName);
    },
  };

  return <DocumentContext value={value}>{children}</DocumentContext>;
}

export function useDocumentContext(): DocumentContextValue {
  const ctx = use(DocumentContext);
  if (!ctx) {
    throw new Error('[useDocumentContext] Must be used within <DocumentProvider>');
  }
  return ctx;
}
