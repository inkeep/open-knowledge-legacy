import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createContext, type ReactNode, use, useEffect, useState, useTransition } from 'react';
import { createOpenDocumentTransition } from './document-transition';
import { ProviderPool, type SyncState } from './provider-pool';
import { __rejectSyncPromise, __test_armPendingRejection } from './sync-promise';

/**
 * Read-only projection of a `PoolEntry` — exposes the fields downstream React
 * components need without leaking the mutable pool internals (observerCleanup,
 * pendingRecycleTimer, tearingDown). Sorted by `lastAccessedAt` descending so
 * consumers like `EditorActivityPool` can apply LRU bounding without re-sorting.
 */
export interface PoolEntrySnapshot {
  docName: string;
  provider: HocuspocusProvider;
  lastAccessedAt: number;
}

export interface DocumentContextValue {
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  syncState: SyncState;
  /**
   * All currently-pooled docs, sorted by `lastAccessedAt` descending (MRU first).
   * Drives `EditorActivityPool`'s ACTIVITY_MOUNT_LIMIT-bounded Activity rendering.
   * System docs (CC1 `__system__`) are filtered at pool admission so they never
   * appear here (see SPEC.md §10 DX7).
   */
  poolEntries: ReadonlyArray<PoolEntrySnapshot>;
  openDocument: (docName: string) => void;
  /**
   * Same as `openDocument` but wrapped in React's `startTransition`. Use this
   * for navigation flows that should (a) preserve previously-revealed content
   * during the suspending re-render (SPEC G2) and (b) surface progress via
   * `isPending` (SPEC G3 — consumed by `NavigationPendingBar`). All
   * user-initiated and agent-initiated navigation should flow through here;
   * `openDocument` is retained for non-transition callers (e.g. test setup).
   */
  openDocumentTransition: (docName: string) => void;
  /**
   * True while a `openDocumentTransition`-initiated navigation is mid-flight,
   * including the time spent suspending on `syncPromise` inside
   * `DocumentBoundary`. Drives `NavigationPendingBar`'s 4-tier escalation.
   */
  isPending: boolean;
  closeDocument: (docName: string) => void;
  /**
   * Destroy and recreate the pool entry for `docName` while preserving
   * `activeDocName`. Used by the "Try again" path in `DocumentErrorBoundary`
   * to recover from `BridgeSetupError` (and any other sync failure where the
   * existing provider is in a known-broken state) without flashing the
   * "Select a document" empty state during the swap.
   */
  recycleDocument: (docName: string) => void;
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
  poolEntries: ReadonlyArray<PoolEntrySnapshot>;
}

const EMPTY_SNAPSHOT: Snapshot = {
  activeDocName: null,
  activeProvider: null,
  syncState: 'connecting',
  poolEntries: [],
};

function takeSnapshot(p: ProviderPool): Snapshot {
  const active = p.getActive();
  // Project mutable pool entries to immutable read-only snapshots, sorted MRU-first.
  // The sort lives here (not in ProviderPool) so the pool stays a plain LRU map and
  // doesn't need to know about React-side ordering preferences.
  const poolEntries: PoolEntrySnapshot[] = [];
  for (const entry of p.entries.values()) {
    poolEntries.push({
      docName: entry.docName,
      provider: entry.provider,
      lastAccessedAt: entry.lastAccessedAt,
    });
  }
  poolEntries.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  return {
    activeDocName: p.getActiveDocName(),
    activeProvider: active?.provider ?? null,
    syncState: active?.syncState ?? 'connecting',
    poolEntries,
  };
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [pinnedDoc, setPinnedDoc] = useState<string | null>(null);
  // `useTransition` (rather than the module-level `startTransition`) is
  // required so `isPending` is observable to context consumers. The
  // transition stays "pending" through any suspending re-renders triggered
  // by the wrapped state updates — exactly what keeps the
  // `NavigationPendingBar` visible until `syncPromise` resolves.
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const p = getPool();

    // Sync initial state
    setSnapshot(takeSnapshot(p));

    // Subscribe to pool changes
    p.setOnChange(() => setSnapshot(takeSnapshot(p)));

    // Hydrate pin state from localStorage (client-only; safe no-op on SSR).
    const persisted = loadPinFromStorage();
    if (persisted !== null) setPinnedDoc(persisted);

    // Expose pool + test hooks on window for Playwright E2E access. Gated on
    // `import.meta.env.DEV` so production bundles don't ship a sync-promise
    // rejection trigger or a WebSocket close primitive — both useful for E2E,
    // both unsafe to leave callable from arbitrary page-context script
    // (extensions, bookmarklets, future embed consumers). Vite replaces this
    // statically at build time, so the entire branch tree-shakes out of the
    // production bundle. Mirrors the dev-only pattern already used in
    // `editor/extensions/slash-command.ts`.
    if (import.meta.env.DEV) {
      window.__providerPool = p;
      Object.defineProperty(window, '__activeProvider', {
        get: () => p.getActive()?.provider ?? null,
        configurable: true,
      });
      window.__test_rejectSyncPromise = (docName, kind) => __rejectSyncPromise(docName, kind);
      window.__test_armPendingRejection = (docName, kind) =>
        __test_armPendingRejection(docName, kind);
      window.__test_closeActiveWebSocket = () => {
        const provider = p.getActive()?.provider;
        if (!provider) return false;
        // HocuspocusProvider wraps y-websocket internally; reach for the live WS
        // via the typed fields we can see, falling back to any-cast for the
        // nested websocketProvider (not in the provider's public TS surface).
        const cfg = provider.configuration as unknown as {
          websocketProvider?: { webSocket?: { close?: () => void } };
        };
        const ws = cfg.websocketProvider?.webSocket;
        if (ws && typeof ws.close === 'function') {
          ws.close();
          return true;
        }
        return false;
      };
    }

    return () => {
      p.setOnChange(null);
    };
  }, []);

  // React Compiler handles memoization — no manual useMemo/useCallback needed
  const openDocument = (docName: string) => {
    const p = getPool();
    const entry = p.open(docName);
    if (!entry) return; // reserved doc (e.g. __system__) — pool refused admission
    p.setActive(docName);
  };
  const openDocumentTransition = createOpenDocumentTransition(openDocument, startTransition);

  const value: DocumentContextValue = {
    activeDocName: snapshot.activeDocName,
    activeProvider: snapshot.activeProvider,
    syncState: snapshot.syncState,
    poolEntries: snapshot.poolEntries,
    openDocument,
    openDocumentTransition,
    isPending,
    closeDocument: (docName: string) => {
      const p = getPool();
      p.close(docName);
    },
    recycleDocument: (docName: string) => {
      const p = getPool();
      p.recycle(docName);
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

/**
 * Convenience hook for navigation consumers (`NavigationHandler`,
 * `DocumentErrorBoundary` retry, sidebar click handlers) that only need the
 * transition surface and don't care about the rest of the document context.
 * Returns `{ openDocumentTransition, isPending }` — both come from the parent
 * `DocumentProvider`'s single `useTransition()` call, so all consumers share
 * the same pending state.
 */
export function useDocumentTransition(): {
  openDocumentTransition: (docName: string) => void;
  isPending: boolean;
} {
  const { openDocumentTransition, isPending } = useDocumentContext();
  return { openDocumentTransition, isPending };
}
