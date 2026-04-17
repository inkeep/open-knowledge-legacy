import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import { useCollabUrl } from '@/lib/use-collab-url';
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
  /**
   * Resolved collab WebSocket URL (from `/api/config` or `bun run dev`
   * same-origin fallback). Null while the initial fetch is in flight or
   * while `server.lock` is absent — consumers that also need the URL
   * (e.g. `SystemDocSubscriber`) skip wiring until resolved.
   */
  collabUrl: string | null;
  /**
   * True when the `/api/config` resolver has given up automatic retries
   * (no resolution within ~30s). Consumer banners surface an actionable
   * error message + manual-retry button. `retryCollab()` resets to
   * auto-retry mode.
   */
  collabTerminal: boolean;
  /** Observed last-error shape (only populated when `collabTerminal`). */
  collabLastError:
    | { kind: 'error'; code: number | 'network' | 'invalid-body' }
    | { kind: 'null-collab' }
    | null;
  /** Reset retry state — exits terminal mode, resumes polling. */
  retryCollab: () => void;
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
// Same pattern the old singleton HocuspocusProvider used. Instantiated lazily
// when `collabUrl` resolves (US-014 / FR-1.13) — not at module load.
let pool: ProviderPool | null = null;

function getPool(collabUrl: string): ProviderPool {
  if (!pool) {
    pool = new ProviderPool(10, collabUrl);
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
  const {
    collabUrl,
    terminal: collabTerminal,
    lastError: collabLastError,
    retry: retryCollab,
  } = useCollabUrl();

  useEffect(() => {
    if (collabUrl === null) return;
    const p = getPool(collabUrl);

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
  }, [collabUrl]);

  // React Compiler handles memoization — no manual useMemo/useCallback needed
  const value: DocumentContextValue = {
    activeDocName: snapshot.activeDocName,
    activeProvider: snapshot.activeProvider,
    syncState: snapshot.syncState,
    openDocument: (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      p.open(docName);
      p.setActive(docName);
    },
    closeDocument: (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
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
    collabUrl,
    collabTerminal,
    collabLastError,
    retryCollab,
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
