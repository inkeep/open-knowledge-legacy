import { useEffect, useRef, useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';
import { hasAgentPresenceShape } from '@/lib/agent-presence';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';
import { LruStringCache } from '@/lib/lru-string-cache';

export interface BurstData {
  stackIndex: number;
  ts: number;
  additions: number;
  deletions: number;
}

export interface FileData {
  docName: string;
  additionsTotal: number;
  deletionsTotal: number;
  lastTs: number;
  bursts: BurstData[];
}

interface AgentHeader {
  displayName: string;
  color: string;
  icon?: string;
  connectionId: string;
}

interface ActivityPanelData {
  sessionAlive: boolean;
  agent: AgentHeader | null;
  files: FileData[];
  writingDocs: Set<string>;
}

type ActivityPanelStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseActivityPanelResult {
  data: ActivityPanelData | null;
  status: ActivityPanelStatus;
  error: string | null;
  reload: () => void;
  fetchBurstDiff: (docName: string, stackIndex: number) => Promise<string>;
}

const REFETCH_DEBOUNCE_MS = 500;

const BURST_DIFF_CACHE_LIMIT = 64;

async function fetchAgentActivity(connectionId: string): Promise<{
  sessionAlive: boolean;
  agent: AgentHeader | null;
  files: FileData[];
}> {
  const url = `/api/agent-activity?agentId=${encodeURIComponent(connectionId)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`agent-activity fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    ok: boolean;
    sessionAlive?: boolean;
    agent?: AgentHeader | null;
    files?: FileData[];
    error?: string;
  };
  if (!body.ok) {
    throw new Error(body.error ?? 'agent-activity fetch not ok');
  }
  return {
    sessionAlive: body.sessionAlive ?? false,
    agent: body.agent ?? null,
    files: body.files ?? [],
  };
}

async function fetchBurstDiffHttp(
  connectionId: string,
  docName: string,
  stackIndex: number,
): Promise<string> {
  const url = `/api/agent-burst-diff?agentId=${encodeURIComponent(
    connectionId,
  )}&docName=${encodeURIComponent(docName)}&stackIndex=${stackIndex}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`agent-burst-diff fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { ok: boolean; diff?: string; error?: string };
  if (!body.ok) {
    throw new Error(body.error ?? 'agent-burst-diff fetch not ok');
  }
  return body.diff ?? '';
}

export function useActivityPanel(connectionId: string | null): UseActivityPanelResult {
  const { systemProvider } = useDocumentContext();
  const [data, setData] = useState<ActivityPanelData | null>(null);
  const [status, setStatus] = useState<ActivityPanelStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const diffCacheRef = useRef<LruStringCache>(new LruStringCache(BURST_DIFF_CACHE_LIMIT));

  const tokenRef = useRef(0);

  const doFetch = (cid: string): void => {
    const token = ++tokenRef.current;
    setStatus('loading');
    setError(null);
    fetchAgentActivity(cid)
      .then((result) => {
        if (tokenRef.current !== token) return; // stale
        const writingDocs = computeWritingDocs(systemProvider, cid);
        setData({ ...result, writingDocs });
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (tokenRef.current !== token) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: systemProvider captured via closure; writingDocs recomputes on its own effect below.
  useEffect(() => {
    if (!connectionId) {
      tokenRef.current++;
      setData(null);
      setStatus('idle');
      setError(null);
      diffCacheRef.current.clear();
      return;
    }
    diffCacheRef.current.clear();
    doFetch(connectionId);

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (!channels.includes('session-activity')) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        doFetch(connectionId);
      }, REFETCH_DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [connectionId]);

  useEffect(() => {
    if (!connectionId) return;
    if (!systemProvider) return;

    const update = (): void => {
      // biome-ignore lint/suspicious/noExplicitAny: Awareness typing differs across Hocuspocus versions.
      const awareness = (systemProvider as { awareness?: unknown }).awareness as any;
      if (!awareness) return;
      const writing = computeWritingDocs(systemProvider, connectionId);
      setData((prev) => {
        if (!prev) return prev;
        if (setsEqual(prev.writingDocs, writing)) return prev;
        return { ...prev, writingDocs: writing };
      });
    };

    // biome-ignore lint/suspicious/noExplicitAny: Awareness typing differs across Hocuspocus versions.
    const awareness = (systemProvider as { awareness?: unknown }).awareness as any;
    if (!awareness || typeof awareness.on !== 'function') {
      update();
      return;
    }
    awareness.on('update', update);
    update();
    const interval = setInterval(update, 1000);
    return () => {
      clearInterval(interval);
      if (typeof awareness.off === 'function') awareness.off('update', update);
    };
  }, [connectionId, systemProvider]);

  const fetchBurstDiff = async (docName: string, stackIndex: number): Promise<string> => {
    if (!connectionId) return '';
    const key = `${docName}\0${stackIndex}`;
    const cached = diffCacheRef.current.get(key);
    if (cached !== undefined) return cached;
    const diff = await fetchBurstDiffHttp(connectionId, docName, stackIndex);
    diffCacheRef.current.set(key, diff);
    return diff;
  };

  const reload = (): void => {
    if (!connectionId) return;
    doFetch(connectionId);
  };

  return { data, status, error, reload, fetchBurstDiff };
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

export function computeWritingDocs(
  systemProvider: { awareness?: unknown } | null,
  connectionId: string,
): Set<string> {
  const out = new Set<string>();
  if (!systemProvider) return out;
  const awareness = systemProvider.awareness;
  if (!hasAgentPresenceShape(awareness)) return out;
  const candidateIds = [
    connectionId,
    connectionId.startsWith('agent-')
      ? connectionId.slice('agent-'.length)
      : `agent-${connectionId}`,
  ];
  for (const state of awareness.getStates().values()) {
    const presence = state.agentPresence;
    if (!presence) continue;
    for (const agentKey of candidateIds) {
      const entry = presence[agentKey];
      if (!entry) continue;
      if (entry.mode === 'writing' && entry.currentDoc) {
        out.add(entry.currentDoc);
      }
    }
  }
  return out;
}
