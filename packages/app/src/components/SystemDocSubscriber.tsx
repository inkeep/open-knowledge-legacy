import { HocuspocusProvider } from '@hocuspocus/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import * as Y from 'yjs';
import { useDocumentContext } from '@/editor/DocumentContext';
import { dispatchCC1Stateless, SYSTEM_DOC_NAME } from '@/lib/cc1';
import { emitConfigIgnoreNestedError } from '@/lib/config-ignore-nested-error-events';
import { emitConfigValidationRejected } from '@/lib/config-validation-events';
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

  const handlersRef = useRef({
    updateServerInstanceId,
    onBranchSwitched,
    observeBranch,
    observeDiskAck,
    refreshServerInfo,
  });
  useEffect(() => {
    handlersRef.current = {
      updateServerInstanceId,
      onBranchSwitched,
      observeBranch,
      observeDiskAck,
      refreshServerInfo,
    };
  });

  useEffect(() => {
    if (collabUrl === null) return;
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: SYSTEM_DOC_NAME,
      document: doc,
      onStateless: ({ payload }: { payload: string }) => {
        dispatchCC1Stateless(payload, {
          onServerInfo: (info) => {
            handlersRef.current.updateServerInstanceId(info.serverInstanceId);
            if (info.currentBranch !== undefined) {
              void handlersRef.current.observeBranch(info.currentBranch);
            }
          },
          onBranchSwitched: (p) => {
            void handlersRef.current.onBranchSwitched(p.branch);
          },
          onDiskAck: (p) => {
            handlersRef.current.observeDiskAck(p.docName, p.sv);
          },
          onDerivedView: (p) => {
            emitDocumentsChanged([p.ch]);
          },
          onConfigValidationRejected: (p) => {
            emitConfigValidationRejected(p);
          },
          onConfigIgnoreNestedError: (p) => {
            emitConfigIgnoreNestedError(p);
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

    const onReconnectSynced = createSyncedReconnectGate(() => {
      void handlersRef.current.refreshServerInfo();
    });
    provider.on('synced', () => {
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
      onReconnectSynced();
    });

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
