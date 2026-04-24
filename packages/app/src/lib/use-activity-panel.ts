/**
 * `useActivityPanel` — data layer for the Agent Activity Panel.
 *
 * Responsibilities (SPEC §5 + FR-P6, FR-P10, FR-P11, FR-P17, FR-P23):
 *   1. On `connectionId` set: fetch `GET /api/agent-activity?agentId=…`.
 *   2. Subscribe to CC1 `'session-activity'` via `subscribeToDocumentsChanged`
 *      and re-fetch after a 500 ms trailing-edge debounce (FR-P23).
 *   3. Subscribe to `__system__` awareness for `agentPresence` and expose a
 *      `writingDocs` set so file rows can show a "writing…" indicator
 *      (FR-P17).
 *   4. Provide `fetchBurstDiff(docName, stackIndex)` — lazy per-burst diff
 *      fetch (FR-P11) with a component-scoped cache so re-expand doesn't
 *      re-fetch (FR-P15).
 *   5. Cancelled-flag semantics: an in-flight fetch that completes AFTER the
 *      connectionId swapped or the component unmounted must NOT update state.
 *
 * Inert mode: `connectionId === null` → no fetches, no subscriptions. Returns
 * `{ data: null, status: 'idle', error: null }` and no-op callbacks.
 *
 * Data source rationale (D-P1 LOCKED) lives in `packages/server/src/agent-
 * activity.ts`. This hook is a pure consumer — never mutates Y.Doc state
 * (NF-P3).
 */
import { useEffect, useRef, useState } from 'react';
import { useDocumentContext } from '@/editor/DocumentContext';
import { hasAgentPresenceShape } from '@/lib/agent-presence';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';

// ---------------------------------------------------------------
// Types (mirror the server's AgentActivityResult / BurstStat shape).
// ---------------------------------------------------------------

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

export interface AgentHeader {
  displayName: string;
  color: string;
  icon?: string;
  connectionId: string;
}

export interface ActivityPanelData {
  sessionAlive: boolean;
  agent: AgentHeader | null;
  files: FileData[];
  /** Set of docNames this agent is currently writing to (FR-P17). */
  writingDocs: Set<string>;
}

type ActivityPanelStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseActivityPanelResult {
  data: ActivityPanelData | null;
  status: ActivityPanelStatus;
  error: string | null;
  /** Trigger a re-fetch of `/api/agent-activity`. No-op when inert. */
  reload: () => void;
  /**
   * Lazy-fetch the unified-diff text for a single burst.
   * Returns the cached diff when available. Re-fetches on cache miss.
   * Throws on network / server failure — callers surface the error in the
   * burst row's expanded state.
   */
  fetchBurstDiff: (docName: string, stackIndex: number) => Promise<string>;
}

const REFETCH_DEBOUNCE_MS = 500;

/**
 * Cap the burst-diff cache so long-lived agent sessions (many bursts × many
 * files) don't grow renderer memory unboundedly. Sized to match the
 * `ProviderPool` precedent (`MAX_POOL = 10`) × ~6 bursts typical for a mid-
 * sized file = 60; rounded up. Beyond the cap, LRU eviction drops the
 * least-recently-fetched entry.
 */
const BURST_DIFF_CACHE_LIMIT = 64;

/**
 * LRU-bounded cache for burst-diff strings keyed by `${docName}\0${stackIndex}`.
 * Read-hits re-insert to move the key to the most-recently-used end; writes
 * evict the oldest entry when the limit is exceeded. Ref-held + mutated in
 * place by the hook — never exposed outside.
 */
class BurstDiffCache {
  private readonly map = new Map<string, string>();

  get(key: string): string | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    // Re-insert to mark as most-recently-used (Map iteration order is
    // insertion-order in JS / V8 / JSC).
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > BURST_DIFF_CACHE_LIMIT) {
      const oldestKey = this.map.keys().next().value;
      if (oldestKey === undefined) break;
      this.map.delete(oldestKey);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

// ---------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------

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

// ---------------------------------------------------------------
// Hook
// ---------------------------------------------------------------

export function useActivityPanel(connectionId: string | null): UseActivityPanelResult {
  const { systemProvider } = useDocumentContext();
  const [data, setData] = useState<ActivityPanelData | null>(null);
  const [status, setStatus] = useState<ActivityPanelStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Burst-diff cache — keyed by `${docName}\0${stackIndex}`. LRU-bounded at
  // BURST_DIFF_CACHE_LIMIT so long-lived agent sessions can't exhaust
  // renderer memory. Cleared when connectionId changes so stale entries
  // from the previous agent's session can never leak into the new view.
  const diffCacheRef = useRef<BurstDiffCache>(new BurstDiffCache());

  // Token ref: each reload() call bumps this. Inflight responses compare
  // against the current token; mismatched = stale = discarded. Survives
  // component-re-render cycles without resetting.
  const tokenRef = useRef(0);

  // Trigger a re-fetch — used by reload() + CC1 debounced callback.
  const doFetch = (cid: string): void => {
    const token = ++tokenRef.current;
    setStatus('loading');
    setError(null);
    fetchAgentActivity(cid)
      .then((result) => {
        if (tokenRef.current !== token) return; // stale
        // Compute writingDocs from current systemProvider awareness (if any).
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

  // (1) + (2) On connectionId set: initial fetch + CC1 debounced subscription.
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

    // CC1: re-fetch on session-activity signal (debounced).
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

  // (3) Subscribe to systemProvider awareness updates → refresh writingDocs.
  // Doesn't re-fetch the full activity list; just updates the `writingDocs`
  // field on the existing `data`. A ~1s backup interval handles stale-entry
  // aging in case awareness events stop firing.
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

  // (4) Lazy burst-diff fetch with cache.
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

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) {
    if (!b.has(v)) return false;
  }
  return true;
}

/**
 * Compute the set of doc names the given agent is currently writing to, by
 * reading the `agentPresence` map off the `__system__` provider's awareness.
 * Accepts either the prefixed broadcaster-key form (`agent-<raw>`) or the
 * raw connectionId — tries both against the map so callers don't need to
 * know which form the presence map stores.
 *
 * Exported so unit tests can verify the prefix-normalization + filter logic
 * without rendering a React tree.
 */
export function computeWritingDocs(
  systemProvider: { awareness?: unknown } | null,
  connectionId: string,
): Set<string> {
  const out = new Set<string>();
  if (!systemProvider) return out;
  const awareness = systemProvider.awareness;
  if (!hasAgentPresenceShape(awareness)) return out;
  // Strip the `agent-` broadcaster-key prefix — presence map keys are the raw
  // agentId (see `toBroadcasterKey` in server/src/boot.ts). connectionId
  // coming from the API is the prefixed form in some paths; accept either.
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
