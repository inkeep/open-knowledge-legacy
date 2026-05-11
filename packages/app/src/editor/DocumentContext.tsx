import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Principal } from '@inkeep/open-knowledge-core';
import { PrincipalSuccessSchema } from '@inkeep/open-knowledge-core';
import { createContext, type ReactNode, use, useEffect, useRef, useState } from 'react';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import { docNameForNavigationTarget } from '@/components/navigation-targets';
import { consumePrewarmClick } from '@/components/prewarm-correlation';
import { docNameFromHash, hashFromDocName, hashFromFolderPath } from '@/lib/doc-hash';
import { mark } from '@/lib/perf';
import { refreshServerInfo } from '@/lib/server-info-refresh';
import { useCollabUrl } from '@/lib/use-collab-url';
import { getEditorForDoc } from './active-editor';
import { handleBranchSwitched } from './branch-invalidation';
import { subscribePoolEviction } from './editor-cache';
import {
  addOpenTab,
  createEditorTabSessionState,
  docNameForTabId,
  docTabId,
  filterOpenTabsForKnownTargets,
  folderTabId,
  localTabSessionStorageKey,
  nextActiveTabAfterClose,
  nextActiveTabAfterCloseMany,
  parseEditorTabId,
  parseEditorTabSessionState,
  readLocalTabSessionState,
  remapOpenTabs,
  removeOpenTab,
  tabIdForNavigationTarget,
  writeLocalTabSessionState,
} from './editor-tabs';
import {
  MAX_POOL,
  ProviderPool,
  type ServerRestartRecoveryState,
  type SyncState,
} from './provider-pool';
import { __rejectSyncPromise, __test_armPendingRejection } from './sync-promise';
import { tabSessionId } from './tab-identity';

export interface PoolEntrySnapshot {
  docName: string;
  provider: HocuspocusProvider;
  lastAccessedAt: number;
  poolEventId: string;
}

interface DocumentContextValue {
  principal: Principal | null;
  activeTarget: ResolvedNavigationTarget | null;
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  openTabs: ReadonlyArray<string>;
  tabSessionLoaded: boolean;
  syncState: SyncState;
  serverRestartRecovery: ServerRestartRecoveryState;
  poolEntries: ReadonlyArray<PoolEntrySnapshot>;
  openDocument: (docName: string) => void;
  openDocumentTransition: (docName: string) => void;
  openTarget: (target: ResolvedNavigationTarget) => void;
  openTargetTransition: (target: ResolvedNavigationTarget) => void;
  clearTarget: () => void;
  closeDocument: (docName: string) => void;
  closeTab: (tabId: string) => void;
  closeTabs: (tabIds: readonly string[]) => void;
  syncOpenTabsWithKnownTargets: (targets: {
    pages: ReadonlySet<string>;
    folderPaths: ReadonlySet<string>;
  }) => void;
  remapTabsForRename: (
    renamed: readonly { fromDocName: string; toDocName: string }[],
    renamedFolders?: readonly { fromPath: string; toPath: string }[],
  ) => void;
  closeAndClearForRename: (docName: string) => Promise<void>;
  recycleDocument: (docName: string) => void;
  prewarm: (docName: string) => string | null;
  systemProvider: HocuspocusProvider | null;
  setSystemProvider: (provider: HocuspocusProvider | null) => void;
  updateServerInstanceId: (id: string | null) => void;
  onBranchSwitched: (branch: string) => Promise<void>;
  observeBranch: (branch: string) => Promise<void>;
  observeDiskAck: (docName: string, sv: Uint8Array) => void;
  refreshServerInfo: () => Promise<void>;
  collabUrl: string | null;
  collabTerminal: boolean;
  collabLastError:
    | { kind: 'error'; code: number | 'network' | 'invalid-body' }
    | { kind: 'null-collab' }
    | null;
  retryCollab: () => void;
  docPanelMode: 'doc' | 'agent';
  docPanelAgentId: string | null;
  docPanelExpandSignal: number;
  openActivityPanel: (connectionId: string) => void;
  closeActivityPanel: () => void;
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

const DocumentContext = createContext<DocumentContextValue | null>(null);

let pool: ProviderPool | null = null;

function getPool(collabUrl: string): ProviderPool {
  if (!pool) {
    pool = new ProviderPool(MAX_POOL, collabUrl);
    subscribePoolEviction(pool);
  }
  return pool;
}

interface Snapshot {
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  syncState: SyncState;
  serverRestartRecovery: ServerRestartRecoveryState;
  poolEntries: ReadonlyArray<PoolEntrySnapshot>;
}

const EMPTY_SNAPSHOT: Snapshot = {
  activeDocName: null,
  activeProvider: null,
  syncState: 'connecting',
  serverRestartRecovery: { kind: 'idle' },
  poolEntries: [],
};

function getDesktopBridge() {
  if (typeof window === 'undefined') return null;
  const bridge = window.okDesktop;
  if (bridge?.config.mode !== 'editor') return null;
  return bridge;
}

function getLocalTabSessionKey(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.okDesktop?.config.mode === 'editor') return null;
  return localTabSessionStorageKey(window.location.origin);
}

function readInitialLocalTabs(): string[] {
  if (typeof window === 'undefined') return [];
  const key = getLocalTabSessionKey();
  if (!key) return [];
  const storage = typeof window.localStorage !== 'undefined' ? window.localStorage : null;
  return readLocalTabSessionState(storage, key, MAX_POOL).openTabs;
}

function hashFromTabId(tabId: string): string {
  const tab = parseEditorTabId(tabId);
  return tab.kind === 'doc' ? hashFromDocName(tab.docName) : hashFromFolderPath(tab.folderPath);
}

function tabIdFromHash(hash: string): string | null {
  const docName = docNameFromHash(hash);
  if (!docName) return null;
  const trimmed = docName.trim();
  if (/\/+$/.test(trimmed)) {
    const folderPath = trimmed.replace(/\/+$/g, '');
    return folderPath ? folderTabId(folderPath) : null;
  }
  return docTabId(docName);
}

function activeTabIdForTarget(
  activeTarget: ResolvedNavigationTarget | null,
  activeDocName: string | null,
): string | null {
  if (activeTarget) return tabIdForNavigationTarget(activeTarget);
  return activeDocName ? docTabId(activeDocName) : null;
}

function takeSnapshot(p: ProviderPool): Snapshot {
  const active = p.getActive();
  const poolEntries: PoolEntrySnapshot[] = [];
  for (const entry of p.entries.values()) {
    poolEntries.push({
      docName: entry.docName,
      provider: entry.provider,
      lastAccessedAt: entry.lastAccessedAt,
      poolEventId: entry.poolEventId,
    });
  }
  poolEntries.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
  return {
    activeDocName: p.getActiveDocName(),
    activeProvider: active?.provider ?? null,
    syncState: active?.syncState ?? 'connecting',
    serverRestartRecovery: p.getServerRestartRecoveryState(),
    poolEntries,
  };
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [activeTarget, setActiveTarget] = useState<ResolvedNavigationTarget | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>(readInitialLocalTabs);
  const [tabSessionLoaded, setTabSessionLoaded] = useState(false);
  const tabSessionMutatedRef = useRef(false);
  const [tabIdentityResolved, setTabIdentityResolved] = useState(false);
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
    if (collabUrl === null || tabSessionLoaded || !tabIdentityResolved) return;
    let cancelled = false;
    const bridge = getDesktopBridge();
    const localKey = getLocalTabSessionKey();
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    const loaded = bridge
      ? bridge.project.getSessionState()
      : Promise.resolve(
          localKey
            ? readLocalTabSessionState(storage, localKey, MAX_POOL)
            : { openTabs: [], activeDocName: null, activeTabId: null, updatedAt: null },
        );

    loaded
      .then((raw) => {
        if (cancelled) return;
        const state = parseEditorTabSessionState(raw, MAX_POOL);
        if (tabSessionMutatedRef.current) return;
        const p = getPool(collabUrl);
        for (const tabId of state.openTabs) {
          const docName = docNameForTabId(tabId);
          if (docName) p.open(docName);
        }
        setOpenTabs((current) => {
          let next = state.openTabs;
          for (const tabId of current) {
            next = addOpenTab(next, tabId, MAX_POOL);
          }
          return next;
        });
        const currentHashDoc = docNameFromHash(window.location.hash);
        const shouldRestoreActive = currentHashDoc === null && window.location.hash.length === 0;
        const restoredActive =
          state.activeTabId ??
          (state.activeDocName ? docTabId(state.activeDocName) : null) ??
          state.openTabs[0] ??
          null;
        if (shouldRestoreActive && restoredActive) {
          window.location.hash = hashFromTabId(restoredActive);
        }
      })
      .catch((err: unknown) => {
        console.warn('[editor-tabs] failed to restore tab session:', err);
      })
      .finally(() => {
        if (!cancelled) setTabSessionLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [collabUrl, tabIdentityResolved, tabSessionLoaded]);

  useEffect(() => {
    if (!tabSessionLoaded) return;
    const activeTabId = activeTabIdForTarget(activeTarget, snapshot.activeDocName);
    const state = createEditorTabSessionState(openTabs, activeTabId);
    const bridge = getDesktopBridge();
    if (bridge) {
      void bridge.project.setSessionState(state).catch((err: unknown) => {
        console.warn('[editor-tabs] failed to persist tab session:', err);
      });
      return;
    }
    const localKey = getLocalTabSessionKey();
    if (!localKey) return;
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    writeLocalTabSessionState(storage, localKey, state);
  }, [activeTarget, openTabs, snapshot.activeDocName, tabSessionLoaded]);

  function markTabSessionMutated() {
    if (!tabSessionLoaded) tabSessionMutatedRef.current = true;
  }

  useEffect(() => {
    if (collabUrl === null) return;
    let cancelled = false;
    setTabIdentityResolved(false);
    const p = getPool(collabUrl);

    setSnapshot(takeSnapshot(p));

    p.setOnBranchMismatch(() => refreshServerInfo(p));

    p.setOnRenameRedirect(({ fromDocName, toDocName, hadOpenProvider }) => {
      void (async () => {
        let cleanupError: unknown;
        const wasActive = p.getActiveDocName() === fromDocName;
        try {
          await Promise.all([
            p.closeAndClearPersistence(fromDocName),
            p.closeAndClearPersistence(toDocName),
          ]);
          if (wasActive) {
            p.open(toDocName);
            p.setActive(toDocName);
          }
          setOpenTabs((current) => remapOpenTabs(current, [{ fromDocName, toDocName }], MAX_POOL));
          setActiveTarget((current) => {
            if (!current) return current;
            const currentDocName = docNameForNavigationTarget(current);
            if (currentDocName === fromDocName) {
              return { kind: 'doc', target: toDocName, docName: toDocName };
            }
            return current;
          });
          if (wasActive) {
            window.location.hash = hashFromDocName(toDocName);
          }
        } catch (err) {
          cleanupError = err;
          console.warn(
            JSON.stringify({
              event: 'removal-cleanup-error',
              kind: 'renamed',
              fromDocName,
              toDocName,
              message: String(err instanceof Error ? err.message : err),
            }),
          );
        }
        console.info(
          JSON.stringify({
            event: 'removal.cleanup',
            kind: 'renamed',
            fromDocName,
            toDocName,
            hadOpenProvider,
            hadStaleIdb: !hadOpenProvider,
            source: 'auth-rejection',
            errored: cleanupError !== undefined,
          }),
        );
      })();
    });
    p.setOnDocDeleted(({ docName, hadOpenProvider }) => {
      void (async () => {
        let cleanupError: unknown;
        try {
          await p.closeAndClearPersistence(docName);
          setOpenTabs((current) => removeOpenTab(current, docName));
          setActiveTarget((current) => {
            if (!current) return current;
            return docNameForNavigationTarget(current) === docName ? null : current;
          });
          if (p.getActiveDocName() === docName) {
            window.location.hash = '';
          }
        } catch (err) {
          cleanupError = err;
          console.warn(
            JSON.stringify({
              event: 'removal-cleanup-error',
              kind: 'deleted',
              docName,
              message: String(err instanceof Error ? err.message : err),
            }),
          );
        }
        console.info(
          JSON.stringify({
            event: 'removal.cleanup',
            kind: 'deleted',
            fromDocName: docName,
            hadOpenProvider,
            hadStaleIdb: !hadOpenProvider,
            source: 'auth-rejection',
            errored: cleanupError !== undefined,
          }),
        );
      })();
    });

    p.setOnChange(() => setSnapshot(takeSnapshot(p)));

    fetch('/api/principal')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: unknown) => {
        if (cancelled) return;
        const parsed = PrincipalSuccessSchema.safeParse(json);
        if (parsed.success) {
          p.setTabIdentity({ principalId: parsed.data.id, tabSessionId });
          setPrincipal(parsed.data);
        } else {
          warnPrincipalFetchOnce(parsed.error);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        warnPrincipalFetchOnce(err);
      })
      .finally(() => {
        if (!cancelled) setTabIdentityResolved(true);
      });

    void refreshServerInfo(p);

    if (import.meta.env.DEV) {
      window.__providerPool = p;
      Object.defineProperty(window, '__activeProvider', {
        get: () => p.getActive()?.provider ?? null,
        configurable: true,
      });
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
      cancelled = true;
      p.setOnChange(null);
      p.setOnRenameRedirect(null);
      p.setOnDocDeleted(null);
    };
  }, [collabUrl]);

  const openDocument = (docName: string) => {
    mark('ok/nav/open-document', { docName, transition: false });
    if (collabUrl === null) return;
    markTabSessionMutated();
    const p = getPool(collabUrl);
    const entry = p.open(docName);
    if (!entry) return; // reserved doc (e.g. __system__) — pool refused admission
    consumePrewarmClick(docName, entry.poolEventId);
    setOpenTabs((current) => addOpenTab(current, docTabId(docName), MAX_POOL));
    p.setActive(docName);
    setActiveTarget({ kind: 'doc', target: docName, docName });
  };
  const openDocumentTransition = (docName: string) => {
    mark('ok/nav/open-document', { docName, transition: false });
    openDocument(docName);
  };

  const openTargetWithOptions = (
    target: ResolvedNavigationTarget,
    options: { markPendingSessionMutation: boolean },
  ) => {
    if (collabUrl === null) return;
    if (options.markPendingSessionMutation) markTabSessionMutated();
    const p = getPool(collabUrl);
    const docName = docNameForNavigationTarget(target);
    if (docName) {
      const entry = p.open(docName);
      if (!entry) return;
      consumePrewarmClick(docName, entry.poolEventId);
      setOpenTabs((current) => addOpenTab(current, docTabId(docName), MAX_POOL));
      p.setActive(docName);
    } else {
      p.clearActive();
      const tabId = tabIdForNavigationTarget(target);
      if (tabId) {
        setOpenTabs((current) => addOpenTab(current, tabId, MAX_POOL));
      }
    }
    setActiveTarget(target);
  };
  const openTarget = (target: ResolvedNavigationTarget) => {
    openTargetWithOptions(target, { markPendingSessionMutation: true });
  };
  const openTargetTransition = (target: ResolvedNavigationTarget) => {
    const docName = docNameForNavigationTarget(target);
    mark('ok/nav/open-target', { docName, kind: target.kind, transition: false });
    openTargetWithOptions(target, { markPendingSessionMutation: false });
  };

  const value: DocumentContextValue = {
    principal,
    activeTarget,
    activeDocName: snapshot.activeDocName,
    activeProvider: snapshot.activeProvider,
    openTabs,
    tabSessionLoaded,
    syncState: snapshot.syncState,
    serverRestartRecovery: snapshot.serverRestartRecovery,
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
      markTabSessionMutated();
      const p = getPool(collabUrl);
      p.close(docName);
      setOpenTabs((current) => removeOpenTab(current, docTabId(docName)));
      setActiveTarget((current) => {
        if (!current) return current;
        return docNameForNavigationTarget(current) === docName ? null : current;
      });
    },
    closeTab: (tabId: string) => {
      markTabSessionMutated();
      let nextActiveTabId: string | null = null;
      const closingDocName = docNameForTabId(tabId);
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        if (closingDocName) p.close(closingDocName);
      }
      const currentActiveTabId = activeTabIdForTarget(activeTarget, snapshot.activeDocName);
      setOpenTabs((current) => {
        nextActiveTabId = nextActiveTabAfterClose(current, currentActiveTabId, tabId);
        return removeOpenTab(current, tabId);
      });
      if (currentActiveTabId !== tabId) return;
      if (nextActiveTabId) {
        window.location.hash = hashFromTabId(nextActiveTabId);
        return;
      }
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.clearActive();
      }
      setActiveTarget(null);
      window.location.hash = '';
    },
    closeTabs: (tabIds: readonly string[]) => {
      markTabSessionMutated();
      const closingTabIds = new Set(tabIds.filter((tabId) => tabId.length > 0));
      if (closingTabIds.size === 0) return;
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        for (const tabId of closingTabIds) {
          const docName = docNameForTabId(tabId);
          if (docName) p.close(docName);
        }
      }

      let nextActiveTabId: string | null = null;
      const currentActiveTabId = activeTabIdForTarget(activeTarget, snapshot.activeDocName);
      setOpenTabs((current) => {
        nextActiveTabId = nextActiveTabAfterCloseMany(current, currentActiveTabId, closingTabIds);
        return current.filter((tabId) => !closingTabIds.has(tabId));
      });

      if (!currentActiveTabId || !closingTabIds.has(currentActiveTabId)) {
        setActiveTarget((current) => {
          if (!current) return current;
          const targetTabId = tabIdForNavigationTarget(current);
          return targetTabId && closingTabIds.has(targetTabId) ? null : current;
        });
        return;
      }
      if (nextActiveTabId) {
        window.location.hash = hashFromTabId(nextActiveTabId);
        return;
      }
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.clearActive();
      }
      setActiveTarget(null);
      window.location.hash = '';
    },
    syncOpenTabsWithKnownTargets: ({ pages, folderPaths }) => {
      const keepMissingDocName = activeTarget?.kind === 'missing' ? activeTarget.target : null;
      const nextOpenTabs = filterOpenTabsForKnownTargets(openTabs, {
        pages,
        folderPaths,
        keepMissingDocName,
      });
      if (nextOpenTabs.length === openTabs.length) return;

      const nextTabIds = new Set(nextOpenTabs);
      const staleTabIds = openTabs.filter((tabId) => !nextTabIds.has(tabId));
      const staleTabIdSet = new Set(staleTabIds);
      markTabSessionMutated();

      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        for (const tabId of staleTabIds) {
          const docName = docNameForTabId(tabId);
          if (docName) p.close(docName);
        }
      }

      setOpenTabs(nextOpenTabs);

      const hashTabId = typeof window !== 'undefined' ? tabIdFromHash(window.location.hash) : null;
      const currentActiveTabId = activeTabIdForTarget(activeTarget, snapshot.activeDocName);
      const tabToReplace =
        hashTabId && staleTabIdSet.has(hashTabId)
          ? hashTabId
          : currentActiveTabId && staleTabIdSet.has(currentActiveTabId)
            ? currentActiveTabId
            : null;

      if (!tabToReplace) {
        setActiveTarget((current) => {
          if (!current) return current;
          const targetTabId = tabIdForNavigationTarget(current);
          return targetTabId && staleTabIdSet.has(targetTabId) ? null : current;
        });
        return;
      }

      const nextActiveTabId = nextActiveTabAfterCloseMany(openTabs, tabToReplace, staleTabIds);
      if (nextActiveTabId) {
        window.location.hash = hashFromTabId(nextActiveTabId);
        return;
      }
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.clearActive();
      }
      setActiveTarget(null);
      window.location.hash = '';
    },
    remapTabsForRename: (renamed, renamedFolders = []) => {
      markTabSessionMutated();
      const next = remapOpenTabs(openTabs, renamed, MAX_POOL, renamedFolders);
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        for (const tabId of next) {
          const docName = docNameForTabId(tabId);
          if (docName) p.open(docName);
        }
      }
      setOpenTabs(next);
    },
    closeAndClearForRename: async (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      await p.closeAndClearPersistence(docName);
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
    prewarm: (docName: string): string | null => {
      if (collabUrl === null) return null;
      const p = getPool(collabUrl);
      const entry = p.prewarm(docName);
      return entry?.poolEventId ?? null;
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

export function useDocumentTransition(): {
  openDocumentTransition: (docName: string) => void;
  openTargetTransition: (target: ResolvedNavigationTarget) => void;
} {
  const { openDocumentTransition, openTargetTransition } = useDocumentContext();
  return { openDocumentTransition, openTargetTransition };
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    pool?.dispose();
    pool = null;
    principalFetchWarned = false;
    if (typeof window !== 'undefined') {
      try {
        delete (window as { __providerPool?: unknown }).__providerPool;
        delete (window as { __activeProvider?: unknown }).__activeProvider;
        delete (window as { __activeEditor?: unknown }).__activeEditor;
        delete (window as { __test_rejectSyncPromise?: unknown }).__test_rejectSyncPromise;
        delete (window as { __test_armPendingRejection?: unknown }).__test_armPendingRejection;
        delete (window as { __test_closeActiveWebSocket?: unknown }).__test_closeActiveWebSocket;
      } catch {}
    }
  });
}
