import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import { ProviderPool, type SyncState } from './provider-pool';

export interface DocumentContextValue {
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  syncState: SyncState;
  openDocument: (docName: string) => void;
  closeDocument: (docName: string) => void;
  /**
   * Pinned doc — when non-null, agent-driven navigation (SystemDocSubscriber)
   * does not change the URL even when agent focus moves elsewhere. Persisted
   * per-tab via localStorage `ok-pin-v1`. Null = not pinned = follow agent.
   */
  pinnedDoc: string | null;
  /** Pin the given doc — subsequent agent focus changes are suppressed. */
  pin: (docName: string) => void;
  /** Unpin — resume agent nav on the next focus change. */
  unpin: () => void;
}

const PIN_STORAGE_KEY = 'ok-pin-v1';

function loadPinFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistPinToStorage(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(PIN_STORAGE_KEY);
    else window.localStorage.setItem(PIN_STORAGE_KEY, value);
  } catch {
    // quota exceeded / private mode — ignore silently, pin stays in-memory
  }
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
  const [pinnedDoc, setPinnedDoc] = useState<string | null>(null);

  useEffect(() => {
    const p = getPool();

    // Sync initial state
    setSnapshot(takeSnapshot(p));

    // Subscribe to pool changes
    p.setOnChange(() => setSnapshot(takeSnapshot(p)));

    // Hydrate pin state from localStorage (client-only; safe no-op on SSR).
    const persisted = loadPinFromStorage();
    if (persisted !== null) setPinnedDoc(persisted);

    // Expose pool on window for E2E test access
    window.__providerPool = p;
    Object.defineProperty(window, '__activeProvider', {
      get: () => p.getActive()?.provider ?? null,
      configurable: true,
    });

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
      const entry = p.open(docName);
      if (!entry) return; // reserved doc (e.g. __system__) — pool refused admission
      p.setActive(docName);
    },
    closeDocument: (docName: string) => {
      const p = getPool();
      p.close(docName);
    },
    pinnedDoc,
    pin: (docName: string) => {
      setPinnedDoc(docName);
      persistPinToStorage(docName);
    },
    unpin: () => {
      setPinnedDoc(null);
      persistPinToStorage(null);
    },
  };

  return <DocumentContext value={value}>{children}</DocumentContext>;
}

export function useDocumentContext(): DocumentContextValue {
  const ctx = use(DocumentContext);
  if (!ctx) {
    throw new Error('useDocumentContext must be used within <DocumentProvider />');
  }
  return ctx;
}
