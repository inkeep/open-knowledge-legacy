import type { HocuspocusProvider } from '@hocuspocus/provider';
import type { Principal } from '@inkeep/open-knowledge-core';
import { PrincipalResponseSchema } from '@inkeep/open-knowledge-core';
import { createContext, type ReactNode, use, useEffect, useState } from 'react';
import type { ResolvedNavigationTarget } from '@/components/navigation-targets';
import { docNameForNavigationTarget } from '@/components/navigation-targets';
import { docNameFromHash, hashFromDocName } from '@/lib/doc-hash';
import { mark } from '@/lib/perf';
import { refreshServerInfo } from '@/lib/server-info-refresh';
import { useCollabUrl } from '@/lib/use-collab-url';
import { getEditorForDoc } from './active-editor';
import { handleBranchSwitched } from './branch-invalidation';
import { subscribePoolEviction } from './editor-cache';
import {
  addOpenTab,
  createEditorTabSessionState,
  localTabSessionStorageKey,
  nextActiveDocAfterClose,
  parseEditorTabSessionState,
  readLocalTabSessionState,
  remapOpenTabs,
  removeOpenTab,
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
}

interface DocumentContextValue {
  principal: Principal | null;
  activeTarget: ResolvedNavigationTarget | null;
  activeDocName: string | null;
  activeProvider: HocuspocusProvider | null;
  openTabs: ReadonlyArray<string>;
  syncState: SyncState;
  serverRestartRecovery: ServerRestartRecoveryState;
  poolEntries: ReadonlyArray<PoolEntrySnapshot>;
  openDocument: (docName: string) => void;
  openDocumentTransition: (docName: string) => void;
  openTarget: (target: ResolvedNavigationTarget) => void;
  openTargetTransition: (target: ResolvedNavigationTarget) => void;
  clearTarget: () => void;
  closeDocument: (docName: string) => void;
  closeTab: (docName: string) => void;
  remapTabsForRename: (renamed: readonly { fromDocName: string; toDocName: string }[]) => void;
  closeAndClearForRename: (docName: string) => Promise<void>;
  recycleDocument: (docName: string) => void;
  prewarm: (docName: string) => void;
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

function takeSnapshot(p: ProviderPool): Snapshot {
  const active = p.getActive();
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
    serverRestartRecovery: p.getServerRestartRecoveryState(),
    poolEntries,
  };
}

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [activeTarget, setActiveTarget] = useState<ResolvedNavigationTarget | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>(readInitialLocalTabs);
  const [tabSessionLoaded, setTabSessionLoaded] = useState(false);
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
            : { openTabs: [], activeDocName: null, updatedAt: null },
        );

    loaded
      .then((raw) => {
        if (cancelled) return;
        const state = parseEditorTabSessionState(raw, MAX_POOL);
        const p = getPool(collabUrl);
        for (const docName of state.openTabs) {
          p.open(docName);
        }
        setOpenTabs((current) => {
          let next = state.openTabs;
          for (const docName of current) {
            next = addOpenTab(next, docName, MAX_POOL);
          }
          return next;
        });
        const currentHashDoc = docNameFromHash(window.location.hash);
        const shouldRestoreActive = currentHashDoc === null && window.location.hash.length === 0;
        const restoredActive = state.activeDocName ?? state.openTabs[0] ?? null;
        if (shouldRestoreActive && restoredActive) {
          window.location.hash = hashFromDocName(restoredActive);
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
    const state = createEditorTabSessionState(openTabs, snapshot.activeDocName);
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
  }, [openTabs, snapshot.activeDocName, tabSessionLoaded]);

  useEffect(() => {
    if (collabUrl === null) return;
    let cancelled = false;
    setTabIdentityResolved(false);
    const p = getPool(collabUrl);

    setSnapshot(takeSnapshot(p));

    p.setOnBranchMismatch(() => refreshServerInfo(p));

    p.setOnChange(() => setSnapshot(takeSnapshot(p)));

    fetch('/api/principal')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: unknown) => {
        if (cancelled) return;
        const parsed = PrincipalResponseSchema.safeParse(json);
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
    };
  }, [collabUrl]);

  const openDocument = (docName: string) => {
    mark('ok/nav/open-document', { docName, transition: false });
    if (collabUrl === null) return;
    const p = getPool(collabUrl);
    const entry = p.open(docName);
    if (!entry) return; // reserved doc (e.g. __system__) — pool refused admission
    setOpenTabs((current) => addOpenTab(current, docName, MAX_POOL));
    p.setActive(docName);
    setActiveTarget({ kind: 'doc', target: docName, docName });
  };
  const openDocumentTransition = (docName: string) => {
    mark('ok/nav/open-document', { docName, transition: false });
    openDocument(docName);
  };

  const openTarget = (target: ResolvedNavigationTarget) => {
    if (collabUrl === null) return;
    const p = getPool(collabUrl);
    const docName = docNameForNavigationTarget(target);
    if (docName) {
      const entry = p.open(docName);
      if (!entry) return;
      setOpenTabs((current) => addOpenTab(current, docName, MAX_POOL));
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
    openTabs,
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
      const p = getPool(collabUrl);
      p.close(docName);
      setOpenTabs((current) => removeOpenTab(current, docName));
      setActiveTarget((current) => {
        if (!current) return current;
        return docNameForNavigationTarget(current) === docName ? null : current;
      });
    },
    closeTab: (docName: string) => {
      let nextActiveDocName: string | null = null;
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.close(docName);
      }
      setOpenTabs((current) => {
        nextActiveDocName = nextActiveDocAfterClose(current, snapshot.activeDocName, docName);
        return removeOpenTab(current, docName);
      });
      if (snapshot.activeDocName !== docName) return;
      if (nextActiveDocName) {
        window.location.hash = hashFromDocName(nextActiveDocName);
        return;
      }
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        p.clearActive();
      }
      setActiveTarget(null);
      window.location.hash = '';
    },
    remapTabsForRename: (renamed) => {
      const next = remapOpenTabs(openTabs, renamed, MAX_POOL);
      if (collabUrl !== null) {
        const p = getPool(collabUrl);
        for (const docName of next) {
          p.open(docName);
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
    prewarm: (docName: string) => {
      if (collabUrl === null) return;
      const p = getPool(collabUrl);
      p.prewarm(docName);
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
