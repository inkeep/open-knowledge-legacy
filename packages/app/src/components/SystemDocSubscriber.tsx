import { HocuspocusProvider } from '@hocuspocus/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { useDocumentContext } from '@/editor/DocumentContext';
import {
  parseCC1BranchSwitched,
  parseCC1DerivedView,
  parseCC1DiskAck,
  parseCC1ServerInfo,
  SYSTEM_DOC_NAME,
} from '@/lib/cc1';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';

export function SystemDocSubscriber() {
  const queryClient = useQueryClient();
  const {
    collabUrl,
    setSystemProvider,
    updateServerInstanceId,
    onBranchSwitched,
    observeBranch,
    observeDiskAck,
  } = useDocumentContext();

  // Ref pattern: dispatchers are re-created per-render in DocumentContext's `value`
  // literal. Capturing them by closure inside `onStateless` would tie the main
  // effect's lifecycle to every render. Refs read the current dispatchers lazily,
  // keeping the effect's deps stable.
  const updateServerInstanceIdRef = useRef(updateServerInstanceId);
  const onBranchSwitchedRef = useRef(onBranchSwitched);
  const observeBranchRef = useRef(observeBranch);
  const observeDiskAckRef = useRef(observeDiskAck);
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
    if (collabUrl === null) return;
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: SYSTEM_DOC_NAME,
      document: doc,
      onStateless: ({ payload }: { payload: string }) => {
        // CC1 stateless channel multiplexes four payload shapes:
        //   server-info → updates pool's cachedServerInstanceId; piggybacks
        //                 currentBranch as the `branch-switched` late-join
        //                 backstop, dispatched via observeBranch.
        //   branch-switched → triggers handleBranchSwitched (clearData + recycle)
        //   disk-ack → advances the per-doc lastDiskAckedSV watermark
        //   derived-view (files/backlinks/graph/sync-status/session-activity) → invalidates queries
        // Schemas are mutually exclusive by `ch`; check in order, short-circuit on match.
        const serverInfo = parseCC1ServerInfo(payload);
        if (serverInfo) {
          updateServerInstanceIdRef.current(serverInfo.serverInstanceId);
          if (serverInfo.currentBranch !== undefined) {
            void observeBranchRef.current(serverInfo.currentBranch);
          }
          return;
        }
        const branchSwitched = parseCC1BranchSwitched(payload);
        if (branchSwitched) {
          void onBranchSwitchedRef.current(branchSwitched.branch);
          return;
        }
        const diskAck = parseCC1DiskAck(payload);
        if (diskAck) {
          observeDiskAckRef.current(diskAck.docName, diskAck.sv);
          return;
        }
        const signal = parseCC1DerivedView(payload);
        if (!signal) {
          console.warn('[CC1] Unparseable stateless payload, skipping:', payload.slice(0, 100));
          return;
        }
        emitDocumentsChanged([signal.ch]);
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

    provider.on('synced', () => {
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
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
