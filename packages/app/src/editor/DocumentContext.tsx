import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Principal } from '@inkeep/open-knowledge-core';
import { PrincipalResponseSchema } from '@inkeep/open-knowledge-core';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import { docNameForNavigationTarget } from '@/components/navigation-targets';
import { mark } from '@/lib/perf';
import { refreshServerInfo } from '@/lib/server-info-refresh';
import { useCollabUrl } from '@/lib/use-collab-url';
import { getEditorForDoc } from './active-editor';
import { handleBranchSwitched } from './branch-invalidation';
import { subscribePoolEviction } from './editor-cache';
import { MAX_POOL, ProviderPool, type SyncState } from './provider-pool';
import { __rejectSyncPromise, __test_armPendingRejection } from './sync-promise';
import { tabSessionId } from './tab-identity';

/**
 * Read-only projection of a `PoolEntry` — exposes the fields downstream React
 * components need without leaking the mutable pool internals (`kind`
 * discriminator, `persistence`, `observerCleanup`, `pendingRecycleTimer`).
 * Sorted by `lastAccessedAt` descending so consumers like `EditorActivityPool`
 * can apply LRU bounding without re-sorting.
 */
export interface PoolEntrySnapshot {
  docName: string;
  provider: HocuspocusProvider;
  lastAccessedAt: number;
}

interface DocumentContextValue {
  /**
   * The resolved principal from `/api/principal`. Null while the fetch is in
   * flight or if it failed/was absent. Consumers use this to prefer real
   * git-config identity over the random animal-adjective fallback in awareness.
   */
  principal: Principal | null;
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
   * Navigation entry — kept for API symmetry with `openTargetTransition`.
   * Previously wrapped in `startTransition`; the wrapper was removed because
   * deferring shell state (`activeDocName`, `activeTarget`) made the sidebar
   * highlight and header title lag the click. React's default Suspense
   * behavior already handles both paths: cold nav suspends →
   * `<EditorSkeleton />` fallback paints immediately; warm nav doesn't
   * suspend (`syncPromise` is pre-resolved for `hasSynced=true` providers)
   * so the commit lands in a single synchronous paint. The name is
   * preserved to keep the migration path to a future per-subtree transition
   * open — callers shouldn't need to choose between transition and
   * non-transition APIs.
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
   * Hash-driven navigation entry (`NavigationHandler` in `App.tsx`). Kept
   * alongside `openTarget` for API symmetry with `openDocumentTransition`
   * — both names historically wrapped the underlying call in
   * `startTransition`. Transitions were removed; see `openDocumentTransition`
   * for rationale. `openTarget` is retained for non-transition callers
   * (tests, direct agent actions).
   */
  openTargetTransition: (target: ResolvedNavigationTarget) => void;
  clearTarget: () => void;
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
   * Pre-warm a provider for `docName` without promoting it to active
   * (review Major #7 / V2 SPEC FR12 Option G). Used by the sidebar's
   * hover-intent handler to shave the Hocuspocus sync cost off the
   * eventual click. Idempotent + no-op for system docs.
   */
  prewarm: (docName: string) => void;
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
   * The `__system__` HocuspocusProvider, lifted from `SystemDocSubscriber`
   * so presence-bar consumers (`usePresence` in US-006) can read agent
   * presence from `__system__.awareness` without re-materializing a second
   * provider. `null` while the subscriber is mounting or between collabUrl
   * resets. Set via `setSystemProvider` — do NOT assign directly.
   */
  systemProvider: HocuspocusProvider | null;
  /**
   * Provider-registration callback used by `SystemDocSubscriber` to publish
   * its `__system__` provider (and null on unmount). Single-writer by
   * convention — only one SystemDocSubscriber should mount at a time.
   */
  setSystemProvider: (provider: HocuspocusProvider | null) => void;
  /**
   * Update the pool's cached server instance ID. Called by
   * `SystemDocSubscriber` on every `__system__` CC1 `server-info` broadcast
   * so the pool's next provider-open claim matches the live server. Null
   * clears the claim (used by the auth-failure recycle path).
   */
  updateServerInstanceId: (id: string | null) => void;
  /**
   * Invalidate every open provider's IndexedDB persistence and recycle
   * the providers. Called by `SystemDocSubscriber` on every `__system__`
   * CC1 `branch-switched` broadcast so the client discards content
   * authored against the previous branch and re-syncs from the
   * markdown-rebuilt post-switch state. Delegates to
   * `handleBranchSwitched` in `branch-invalidation.ts`.
   */
  onBranchSwitched: (branch: string) => Promise<void>;
  /**
   * Late-join backstop for CC1 `branch-switched`. Called whenever a
   * channel reports the current branch (boot HTTP `/api/server-info`
   * fetch + every CC1 `server-info` frame on `__system__` connect /
   * reconnect). First call seeds the observed value; subsequent
   * mismatches replay `handleBranchSwitched` client-side, covering the
   * window where the live broadcast was missed.
   */
  observeBranch: (branch: string) => Promise<void>;
  /**
   * Dispatcher for CC1 `disk-ack` payloads — advances the per-entry
   * `lastDiskAckedSV` watermark. `handleServerInstanceMismatch` reads
   * this watermark when computing the recycle buffer baseline so the
   * client only re-replays updates the server has NOT yet durably
   * persisted. Called by `SystemDocSubscriber` for every recognized
   * `disk-ack` frame.
   */
  observeDiskAck: (docName: string, sv: Uint8Array) => void;
  /**
   * Re-fetch `/api/server-info` and dispatch every recognized field
   * (instanceId, branch, disk-ack watermarks). Called by
   * `SystemDocSubscriber` on every `__system__` reconnect to recover
   * from missed CC1 stateless broadcasts (which have no replay).
   * Boot path uses the same helper for consistency. Idempotent —
   * each dispatcher no-ops on unchanged inputs, so a redundant call
   * costs only one HTTP round-trip.
   */
  refreshServerInfo: () => Promise<void>;
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
  /**
   * DocPanel mode — which scope the right-rail panel is showing.
   *   - `'doc'`:   existing 5-tab info pane keyed to `activeDocName`.
   *   - `'agent'`: Activity view keyed to `docPanelAgentId` (one agent session).
   *
   * Default is `'doc'` on every fresh tab. Tab-scoped state (not persisted),
   * per SPEC 2026-04-24-activity-panel-to-docpanel-mode-toggle FR-T11.
   */
  docPanelMode: 'doc' | 'agent';
  /**
   * connectionId of the agent the panel is scoped to when in `'agent'` mode.
   * Preserved across mode flips (FR-T12) — flipping `agent → doc → agent`
   * still shows the previously-scoped agent. Cleared only by explicit
   * `closeActivityPanel()` or swap to a different agent.
   */
  docPanelAgentId: string | null;
  /**
   * Monotonic expand-request counter. `openActivityPanel` increments this
   * in the same setState pass that flips `docPanelMode`. `EditorArea`
   * observes the counter via `useEffect` and calls `panel.expand()` (desktop)
   * or `setSheetOpen(true)` (mobile) on each increment — idempotent if the
   * panel is already visible. Implements FR-T10 (auto-expand on avatar click).
   */
  docPanelExpandSignal: number;
  /**
   * Open (or swap, or toggle off) the DocPanel's agent mode:
   *   - Panel is doc mode, or agent mode with a different agent → flip to
   *     agent mode, scope to this connectionId, increment expand signal.
   *   - Panel is agent mode with this SAME connectionId → flip back to doc
   *     mode. Agent id is preserved so flipping back via the mode toggle
   *     resumes the same session (toggle semantics; preserves SPEC-23 FR-P3).
   *
   * Method name preserved from SPEC-23 so the `PresenceBar` call site does
   * not change. The hook `useActivityPanel` resets burst-cache and expand
   * state on connectionId change, so swap semantics fall out naturally.
   */
  openActivityPanel: (connectionId: string) => void;
  /** Explicit "show the doc info again" affordance. Clears agent id too. */
  closeActivityPanel: () => void;
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

let principalFetchWarned = false;
function warnPrincipalFetchOnce(err: unknown): void {
  if (principalFetchWarned) return;
  principalFetchWarned = true;
  console.warn(
    '[principal-fetch] failed to resolve principal — falling back to random identity.',
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
    // Wire the editor cache to the pool's eviction events. Without this
    // subscription, cached `Editor` / `EditorView` instances would
    // outlive the Y.Doc they're bound to. Single subscription per pool
    // lifetime; the unsubscribe handle is intentionally dropped — the
    // pool is a module-level singleton and only torn down on HMR/dispose,
    // at which point its listener Set is GC'd along with the pool.
    subscribePoolEviction(pool);
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
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [systemProvider, setSystemProvider] = useState<HocuspocusProvider | null>(null);
  const [docPanelMode, setDocPanelModeState] = useState<'doc' | 'agent'>('doc');
  const [docPanelAgentId, setDocPanelAgentId] = useState<string | null>(null);
  const [docPanelExpandSignal, setDocPanelExpandSignal] = useState<number>(0);
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

    // Late-join branch backstop. Auth-token `expectedBranch` claim
    // mismatch (server is on branch B, client claims branch A) routes
    // through the same handleBranchSwitched flow as the live CC1
    // broadcast. The fresh branch comes from /api/server-info — the
    // pool's lastObservedBranch is stale by definition (it's what the
    // failed claim was built from).
    //
    // Returning the promise (not `void`) is load-bearing: the pool's
    // in-flight gate awaits whatever the callback returns. A
    // `void`-fronted fetch resolves the gate on the next microtask
    // while the recovery is still in flight, so cross-turn mismatches
    // (N providers, N RTTs) re-fire the dispatch and double-recycle.
    p.setOnBranchMismatch(() => refreshServerInfo(p));

    // Subscribe to pool changes
    p.setOnChange(() => setSnapshot(takeSnapshot(p)));

    // Hydrate pin state from localStorage (client-only; safe no-op on SSR).
    const persisted = loadPinFromStorage();
    if (persisted !== null) setPinnedDoc(persisted);

    // Fetch principal and wire tab identity so HocuspocusProvider includes
    // {principalId, tabSessionId} in its auth token. The server's
    // onAuthenticate hook reads this to set connection.context.principalId for
    // correct writer attribution. Also lifts the resolved principal into React
    // state so TiptapEditor can prefer real names over random animal fallbacks.
    // Silent on failure — pool uses anonymous token; presence falls back to random.
    fetch('/api/principal')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: unknown) => {
        const parsed = PrincipalResponseSchema.safeParse(json);
        if (parsed.success) {
          p.setTabIdentity({ principalId: parsed.data.id, tabSessionId });
          setPrincipal(parsed.data);
        } else {
          warnPrincipalFetchOnce(parsed.error);
        }
      })
      .catch((err: unknown) => {
        warnPrincipalFetchOnce(err);
      });

    // CRDT server-restart recovery boot fetch: pull the server's
    // per-process instance ID, current git branch, and per-doc
    // disk-ack watermarks at startup, dispatch them all into the
    // pool. Subsequent provider opens claim the instance ID + branch
    // in their auth tokens so server-side enforcement can reject a
    // stale-client reconnect before Yjs sync merges ghost state. The
    // disk-ack batch refreshes per-entry `lastDiskAckedSV` so the
    // mismatch-recycle baseline-selection always operates on fresh
    // data (closes the missed-frame staleness gap that CC1 stateless
    // broadcasts otherwise leave open).
    //
    // SystemDocSubscriber re-fires this on every `__system__` reconnect
    // — same helper, same dispatch — so a brief WS drop doesn't leave
    // any of the three watermarks permanently stale.
    void refreshServerInfo(p);

    // systemProvider exposure happens in a dedicated effect below because it
    // depends on `systemProvider` state, not `collabUrl`.
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

  // DEV-only: expose a pin-setter hook for Playwright E2E — keeps tests
  // off the private `ok-pin-v1` localStorage key + reload dance, so
  // storage-key renames or versioning changes don't silently break E2E
  // coverage. Calls the real `setPinnedDoc` state setter (matches in-app
  // UX via `pin()` button) + `persistPinToStorage` so post-reload
  // behavior also matches.
  //
  // STOP — empty deps is intentional and must stay empty:
  //   - `setPinnedDoc` is a stable React state setter (guaranteed by
  //     React's useState contract).
  //   - `persistPinToStorage` is module-scope (not a closure over render).
  //   - Widening the deps would cause this effect to re-register on
  //     every render, tearing down + re-installing `window.__test_setPin`
  //     mid-test and racing Playwright's `page.evaluate`.
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;
    (window as unknown as { __test_setPin: (docName: string | null) => void }).__test_setPin = (
      docName: string | null,
    ) => {
      setPinnedDoc(docName);
      persistPinToStorage(docName);
    };
    return () => {
      delete (window as { __test_setPin?: unknown }).__test_setPin;
    };
  }, []);

  // React Compiler handles memoization — no manual useMemo/useCallback needed
  const openDocument = (docName: string) => {
    mark('ok/nav/open-document', { docName, transition: false });
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
  // Historical note: this wrapper used to call `startTransition(() =>
  // openDocument(docName))` and later a fast/slow split keyed on the
  // provider's `hasSynced`. Both approaches held shell state (activeDocName
  // driving the sidebar highlight + header title) for the full editor-mount
  // window, making the click feel laggy. Now it's a pass-through — React's
  // default Suspense behavior handles cold (skeleton) and warm (no
  // suspension → fast commit) without deferring the shell.
  const openDocumentTransition = (docName: string) => {
    mark('ok/nav/open-document', { docName, transition: false });
    openDocument(docName);
  };

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
    const docName = docNameForNavigationTarget(target);
    mark('ok/nav/open-target', { docName, kind: target.kind, transition: false });
    openTarget(target);
  };

  const value: DocumentContextValue = {
    principal,
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
    prewarm: (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      p.prewarm(docName);
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
    systemProvider,
    setSystemProvider,
    updateServerInstanceId: (id: string | null) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      p.setExpectedServerInstanceId(id);
    },
    onBranchSwitched: async (branch: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      p.setObservedBranch(branch);
      await handleBranchSwitched(p, branch);
    },
    observeBranch: async (branch: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      // First observation seeds the pool's branch state without invalidating;
      // subsequent mismatches replay handleBranchSwitched client-side.
      if (p.compareAndUpdateObservedBranch(branch)) {
        await handleBranchSwitched(p, branch);
      }
    },
    observeDiskAck: (docName: string, sv: Uint8Array) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      p.observeDiskAck(docName, sv);
    },
    refreshServerInfo: async () => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      await refreshServerInfo(p);
    },
    collabUrl,
    collabTerminal,
    collabLastError,
    retryCollab,
    docPanelMode,
    docPanelAgentId,
    docPanelExpandSignal,
    openActivityPanel: (connectionId: string) => {
      // Toggle / swap / open-with-expand, per SPEC-24 FR-T6/T7/T8/T9.
      // Same agent already scoped AND already in agent mode → flip back
      // to doc mode (toggle). Anything else → go/stay in agent mode with
      // the new (or same) id AND bump the expand signal so `EditorArea`
      // expands a collapsed panel.
      if (docPanelMode === 'agent' && docPanelAgentId === connectionId) {
        setDocPanelModeState('doc');
        return;
      }
      setDocPanelAgentId(connectionId);
      setDocPanelModeState('agent');
      setDocPanelExpandSignal((prev) => prev + 1);
    },
    closeActivityPanel: () => {
      setDocPanelModeState('doc');
      setDocPanelAgentId(null);
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
 * nav surface and don't care about the rest of the document context.
 * `openDocumentTransition` is the doc-by-name path; `openTargetTransition`
 * is the folder-aware resolver path (hash-driven nav via `NavigationHandler`).
 * The `*Transition` suffix is a historical name — see the context values'
 * docstrings for why there is no longer a React transition behind it.
 */
export function useDocumentTransition(): {
  openDocumentTransition: (docName: string) => void;
  openTargetTransition: (target: ResolvedNavigationTarget) => void;
} {
  const { openDocumentTransition, openTargetTransition } = useDocumentContext();
  return { openDocumentTransition, openTargetTransition };
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
    principalFetchWarned = false;
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
