import type { HocuspocusProvider } from '@hocuspocus/provider';
import { createContext, type ReactNode, use, useEffect, useState, useTransition } from 'react';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import { docNameForNavigationTarget } from '@/components/navigation-targets';
import { useCollabUrl } from '@/lib/use-collab-url';
import { getEditorForDoc } from './active-editor';
import { createOpenDocumentTransition } from './document-transition';
import { MAX_POOL, ProviderPool, type SyncState } from './provider-pool';
import { __rejectSyncPromise, __test_armPendingRejection } from './sync-promise';
import { tabSessionId } from './tab-identity';

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

interface DocumentContextValue {
  activeTarget: ResolvedNavigationTarget | null;
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
   * Set the active navigation target (doc / folder-index / folder / missing)
   * per the folder-aware resolver introduced in PR #175. For a `doc` target
   * this opens/activates the pooled provider; for `folder` it clears the
   * active doc so `EditorArea` renders `<FolderOverview>`; for `missing` it
   * sets the new-doc intent and opens the pooled provider.
   */
  openTarget: (target: ResolvedNavigationTarget) => void;
  /**
   * Same as `openTarget` but wrapped in React's `startTransition`. This is
   * the canonical hash-driven nav path (`NavigationHandler` in `App.tsx`)
   * so the transition surfaces the `isPending` state that drives
   * `NavigationPendingBar` AND keeps the previously-revealed subtree visible
   * during the suspending re-render (SPEC G2+G3). `openTarget` is retained
   * for non-transition callers (tests, direct agent actions).
   */
  openTargetTransition: (target: ResolvedNavigationTarget) => void;
  clearTarget: () => void;
  /**
   * True while a transition-wrapped navigation is mid-flight, including the
   * time spent suspending on `syncPromise` inside `DocumentBoundary`. Shared
   * across `openDocumentTransition` and `openTargetTransition` — a single
   * `useTransition()` at the provider level, so every consumer of
   * `useDocumentTransition()` sees the same pending state. Drives
   * `NavigationPendingBar`'s 4-tier escalation.
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

/**
 * Emit a one-time console.warn when localStorage access fails (private mode,
 * quota exceeded, disabled storage). The silent-swallow itself is correct —
 * the pin stays in-memory and UX is unaffected within the current tab —
 * but a single log per session helps diagnose "my pin keeps disappearing
 * across reloads" reports. Module-scope flag so noise is bounded even when
 * many writes fail in sequence.
 */
let pinPersistWarned = false;
function warnPinPersistFailureOnce(err: unknown): void {
  if (pinPersistWarned) return;
  pinPersistWarned = true;
  console.warn(
    '[DocumentContext] localStorage unavailable — pinned doc will not persist across tabs/reloads.',
    err,
  );
}

function loadPinFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY);
  } catch (err) {
    warnPinPersistFailureOnce(err);
    return null;
  }
}

function persistPinToStorage(value: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(PIN_STORAGE_KEY);
    else window.localStorage.setItem(PIN_STORAGE_KEY, value);
  } catch (err) {
    // quota exceeded / private mode — pin stays in-memory; warn once for observability
    warnPinPersistFailureOnce(err);
  }
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

// Module-level singleton — survives React re-renders and StrictMode double-mount.
// Same pattern the old singleton HocuspocusProvider used. Instantiated lazily
// when `collabUrl` resolves (US-014 / FR-1.13) — not at module load.
//
// Under Vite HMR the binding resets on module reload; the `import.meta.hot.dispose`
// handler at the bottom of this file disposes the previous pool before the new
// module instance takes over so WebSocket / observer / timer state doesn't leak.
let pool: ProviderPool | null = null;

function getPool(collabUrl: string): ProviderPool {
  if (!pool) {
    pool = new ProviderPool(MAX_POOL, collabUrl);
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
  const [activeTarget, setActiveTarget] = useState<ResolvedNavigationTarget | null>(null);
  const [pinnedDoc, setPinnedDoc] = useState<string | null>(null);
  const {
    collabUrl,
    terminal: collabTerminal,
    lastError: collabLastError,
    retry: retryCollab,
  } = useCollabUrl();
  // `useTransition` (rather than the module-level `startTransition`) is
  // required so `isPending` is observable to context consumers. The
  // transition stays "pending" through any suspending re-renders triggered
  // by the wrapped state updates — exactly what keeps the
  // `NavigationPendingBar` visible until `syncPromise` resolves.
  const [isPending, startTransition] = useTransition();

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

    // D50 / US-024: fetch principal and wire tab identity so HocuspocusProvider
    // includes {principalId, tabSessionId} in its auth token. The server's
    // onAuthenticate hook reads this to set connection.context.principalId for
    // correct writer attribution. Silent on failure — pool uses anonymous token.
    fetch('/api/principal')
      .then((r) => (r.ok ? r.json() : null))
      .then((principal: unknown) => {
        if (principal && typeof (principal as { id?: unknown }).id === 'string') {
          p.setTabIdentity({
            principalId: (principal as { id: string }).id,
            tabSessionId,
          });
        }
      })
      .catch(() => {
        // principal unavailable — pool opens providers with anonymous auth token
      });

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
      // Mirror of `__activeProvider` for the registered Editor instance.
      // Resolving via `getActive()?.docName` keeps the getter consistent with
      // `__activeProvider`'s active-entry semantics even when multiple editors
      // are mounted concurrently (EditorActivityPool's ACTIVITY_MOUNT_LIMIT).
      // Playwright reads this to poll PM `editor.state.selection` directly —
      // see precedent §20(a) category C.
      Object.defineProperty(window, '__activeEditor', {
        get: () => {
          const active = p.getActive();
          if (!active) return null;
          return getEditorForDoc(active.docName);
        },
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
  }, [collabUrl]);

  // React Compiler handles memoization — no manual useMemo/useCallback needed
  const openDocument = (docName: string) => {
    if (collabUrl === null) return;
    const p = getPool(collabUrl);
    const entry = p.open(docName);
    if (!entry) return; // reserved doc (e.g. __system__) — pool refused admission
    p.setActive(docName);
    // Set a doc-kind ResolvedNavigationTarget so downstream consumers
    // (EditorArea's isNewDoc, EditorPane's folder-mode effect) stay in sync.
    // openTarget() is the canonical path for folder/missing kinds; openDocument
    // stays as a direct-doc affordance for non-resolver callers (tests, etc.).
    setActiveTarget({ kind: 'doc', target: docName, docName });
  };
  const openDocumentTransition = createOpenDocumentTransition(openDocument, startTransition);

  const openTarget = (target: ResolvedNavigationTarget) => {
    if (collabUrl === null) return;
    const p = getPool(collabUrl);
    const docName = docNameForNavigationTarget(target);
    if (docName) {
      p.open(docName);
      p.setActive(docName);
    } else {
      p.clearActive();
    }
    setActiveTarget(target);
  };
  const openTargetTransition = (target: ResolvedNavigationTarget) => {
    startTransition(() => openTarget(target));
  };

  const value: DocumentContextValue = {
    activeTarget,
    activeDocName: snapshot.activeDocName,
    activeProvider: snapshot.activeProvider,
    syncState: snapshot.syncState,
    poolEntries: snapshot.poolEntries,
    openDocument,
    openDocumentTransition,
    openTarget,
    openTargetTransition,
    clearTarget: () => {
      if (collabUrl === null) {
        setActiveTarget(null);
        return;
      }
      const p = getPool(collabUrl);
      p.clearActive();
      setActiveTarget(null);
    },
    isPending,
    closeDocument: (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      p.close(docName);
      setActiveTarget((current) => {
        if (!current) return current;
        return docNameForNavigationTarget(current) === docName ? null : current;
      });
    },
    recycleDocument: (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
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

/**
 * Convenience hook for navigation consumers (`NavigationHandler`,
 * `DocumentErrorBoundary` retry, sidebar click handlers) that only need the
 * transition surface and don't care about the rest of the document context.
 * Returns `{ openDocumentTransition, openTargetTransition, isPending }` — all
 * three come from the parent `DocumentProvider`'s single `useTransition()`
 * call, so every consumer sees the same pending state. `openDocumentTransition`
 * is the doc-by-name path; `openTargetTransition` is the folder-aware resolver
 * path (hash-driven nav via `NavigationHandler`).
 */
export function useDocumentTransition(): {
  openDocumentTransition: (docName: string) => void;
  openTargetTransition: (target: ResolvedNavigationTarget) => void;
  isPending: boolean;
} {
  const { openDocumentTransition, openTargetTransition, isPending } = useDocumentContext();
  return { openDocumentTransition, openTargetTransition, isPending };
}

// Vite HMR dispose — when this module is hot-replaced in dev, tear down the
// previous pool + the dev-only `window.__*` hooks so the replacement module
// instance doesn't see stale providers, WebSockets, observers, timers, or
// dangling getters bound to the old module's `pool` closure. Without this,
// editing this file in dev leaks every provider + observer ever created,
// and Playwright tests reaching for `window.__test_*` after an HMR reload
// would race the old module's references. Production builds strip this
// branch entirely (Vite replaces `import.meta.hot` with `undefined` at
// build time).
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    pool?.dispose();
    pool = null;
    pinPersistWarned = false;
    if (typeof window !== 'undefined') {
      try {
        delete (window as { __providerPool?: unknown }).__providerPool;
        delete (window as { __activeProvider?: unknown }).__activeProvider;
        delete (window as { __activeEditor?: unknown }).__activeEditor;
        delete (window as { __test_rejectSyncPromise?: unknown }).__test_rejectSyncPromise;
        delete (window as { __test_armPendingRejection?: unknown }).__test_armPendingRejection;
        delete (window as { __test_closeActiveWebSocket?: unknown }).__test_closeActiveWebSocket;
      } catch {
        // `delete` can fail on non-configurable properties in older engines;
        // acceptable fall-through in a dev-only cleanup path.
      }
    }
  });
}
