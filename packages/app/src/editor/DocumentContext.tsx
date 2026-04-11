import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import { ProviderPool, type SyncState } from './provider-pool';

export interface DocumentContextValue {
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  syncState: SyncState;
  openDocument: (docName: string) => void;
  closeDocument: (docName: string) => void;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

// Module-level singleton — survives React re-renders and StrictMode double-mount.
// Same pattern the old singleton HocuspocusProvider used.
let pool: ProviderPool | null = null;

function getPool(): ProviderPool {
  if (!pool) {
    pool = new ProviderPool(10);
  }
  return pool;
}

interface Snapshot {
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  syncState: SyncState;
}

const EMPTY_SNAPSHOT: Snapshot = {
  activeDocName: null,
  activeProvider: null,
  syncState: 'connecting',
};

function takeSnapshot(p: ProviderPool): Snapshot {
  const active = p.getActive();
  return {
    activeDocName: p.getActiveDocName(),
    activeProvider: active?.provider ?? null,
    syncState: active?.syncState ?? 'connecting',
  };
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    const p = getPool();

    // Sync initial state
    setSnapshot(takeSnapshot(p));

    // Subscribe to pool changes
    p.setOnChange(() => setSnapshot(takeSnapshot(p)));

    // Expose pool on window for E2E test access
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__providerPool = p;
      Object.defineProperty(window, '__activeProvider', {
        get: () => p.getActive()?.provider ?? null,
        configurable: true,
      });
    }

    return () => {
      p.setOnChange(null);
    };
  }, []);

  // React Compiler handles memoization — no manual useMemo/useCallback needed
  const value: DocumentContextValue = {
    activeDocName: snapshot.activeDocName,
    activeProvider: snapshot.activeProvider,
    syncState: snapshot.syncState,
    openDocument: (docName: string) => {
      const p = getPool();
      p.open(docName);
      p.setActive(docName);
    },
    closeDocument: (docName: string) => {
      const p = getPool();
      p.close(docName);
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
