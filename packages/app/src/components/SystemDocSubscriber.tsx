import { HocuspocusProvider } from '@hocuspocus/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { useDocumentContext } from '@/editor/DocumentContext';
import { dispatchCC1Stateless, SYSTEM_DOC_NAME } from '@/lib/cc1';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';
import { createSyncedReconnectGate } from '@/lib/server-info-refresh';

export function SystemDocSubscriber() {
  const queryClient = useQueryClient();
  const {
    collabUrl,
    setSystemProvider,
    updateServerInstanceId,
    onBranchSwitched,
    observeBranch,
    observeDiskAck,
    refreshServerInfo,
  } = useDocumentContext();

  // Ref pattern: dispatchers are re-created per-render in DocumentContext's `value`
  // literal. Capturing them by closure inside `onStateless` would tie the main
  // effect's lifecycle to every render. Refs read the current dispatchers lazily,
  // keeping the effect's deps stable.
  const updateServerInstanceIdRef = useRef(updateServerInstanceId);
  const onBranchSwitchedRef = useRef(onBranchSwitched);
  const observeBranchRef = useRef(observeBranch);
  const observeDiskAckRef = useRef(observeDiskAck);
  const refreshServerInfoRef = useRef(refreshServerInfo);
  useEffect(() => {
    updateServerInstanceIdRef.current = updateServerInstanceId;
  }, [updateServerInstanceId]);
  useEffect(() => {
    onBranchSwitchedRef.current = onBranchSwitched;
  }, [onBranchSwitched]);
  useEffect(() => {
    observeBranchRef.current = observeBranch;
  }, [observeBranch]);
  useEffect(() => {
    observeDiskAckRef.current = observeDiskAck;
  }, [observeDiskAck]);
  useEffect(() => {
    refreshServerInfoRef.current = refreshServerInfo;
  }, [refreshServerInfo]);

  useEffect(() => {
    if (collabUrl === null) return;
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: SYSTEM_DOC_NAME,
      document: doc,
      onStateless: ({ payload }: { payload: string }) => {
        // CC1 stateless channel multiplexes four payload shapes via the
        // shared dispatcher in `@/lib/cc1` — adding a fifth channel is
        // a one-place edit there, not parallel updates here + the
        // integration harness's `attachSystemDocSubscriber`.
        dispatchCC1Stateless(payload, {
          onServerInfo: (info) => {
            updateServerInstanceIdRef.current(info.serverInstanceId);
            if (info.currentBranch !== undefined) {
              void observeBranchRef.current(info.currentBranch);
            }
          },
          onBranchSwitched: (p) => {
            void onBranchSwitchedRef.current(p.branch);
          },
          onDiskAck: (p) => {
            observeDiskAckRef.current(p.docName, p.sv);
          },
          onDerivedView: (p) => {
            emitDocumentsChanged([p.ch]);
          },
          onUnknown: (raw) => {
            console.warn('[CC1] Unparseable stateless payload, skipping:', raw.slice(0, 100));
          },
        });
      },
      onClose: ({ event }) => {
        console.warn('[CC1] __system__ connection closed:', event.code, event.reason);
      },
      onDisconnect: () => {
        console.warn('[CC1] __system__ disconnected - derived views may be stale');
      },
    });

    const unsubscribe = subscribeToDocumentsChanged((channels) => {
      if (channels.includes('files') || channels.includes('backlinks')) {
        void queryClient.invalidateQueries({ queryKey: ['backlinks'] });
        void queryClient.invalidateQueries({ queryKey: ['forward-links'] });
      }
      if (channels.includes('files') || channels.includes('graph')) {
        void queryClient.invalidateQueries({ queryKey: ['orphans'] });
        void queryClient.invalidateQueries({ queryKey: ['hubs'] });
      }
    });

    // Track first-sync vs subsequent-sync via the shared
    // `createSyncedReconnectGate` helper — same semantics as the
    // integration harness's `attachSystemDocSubscriber`, single
    // source of truth for the "fire-on-reconnect-only" wire-up. The
    // boot fetch (DocumentContext) already covers the initial sync,
    // so we skip the first one to avoid a redundant request. After
    // that, every `synced` is a real WebSocket reconnect — re-fetch
    // /api/server-info to recover any disk-ack / server-info /
    // branch-switched frames missed during the WS drop.
    const onReconnectSynced = createSyncedReconnectGate(() => {
      void refreshServerInfoRef.current();
    });
    provider.on('synced', () => {
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
      onReconnectSynced();
    });

    // One-shot per-clientID warning when a stale bundled client still publishes
    // `user.type === 'agent'` (FR-10). `AwarenessUser.type` is narrowed to
    // `'human'` — anything else is a rollout drift signal. Gated on
    // NODE_ENV !== 'test' to avoid test-environment noise.
    const warnedStaleAgentClients = new Set<number>();
    const handleAwarenessChange = (): void => {
      if (process.env.NODE_ENV === 'test' || !provider.awareness) return;
      for (const [clientId, state] of provider.awareness.getStates().entries()) {
        if (warnedStaleAgentClients.has(clientId)) continue;
        const user = (state as { user?: { type?: string } }).user;
        if (user?.type === 'agent') {
          warnedStaleAgentClients.add(clientId);
          console.warn(
            `[agent-presence] observed stale AwarenessUser.type === 'agent' from clientID ${clientId} — probably a stale bundled client`,
          );
        }
      }
    };
    provider.awareness?.on('change', handleAwarenessChange);
    // Lift the provider into DocumentContext so presence-bar consumers
    // (use-presence in US-006) can read the __system__ awareness without
    // re-materializing a second provider (multi-agent-presence SPEC §9).
    setSystemProvider(provider);

    return () => {
      unsubscribe();
      provider.awareness?.off('change', handleAwarenessChange);
      setSystemProvider(null);
      provider.destroy();
      doc.destroy();
    };
  }, [queryClient, collabUrl, setSystemProvider]);

  return null;
}
