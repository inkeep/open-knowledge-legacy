import { HocuspocusProvider } from '@hocuspocus/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as Y from 'yjs';
import { defaultCollabWsUrl, parseCC1Signal, SYSTEM_DOC_NAME } from '@/lib/cc1';
import { emitDocumentsChanged, subscribeToDocumentsChanged } from '@/lib/documents-events';

export function SystemDocSubscriber() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: defaultCollabWsUrl(),
      name: SYSTEM_DOC_NAME,
      document: doc,
      onStateless: ({ payload }: { payload: string }) => {
        const signal = parseCC1Signal(payload);
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
    });

    provider.on('synced', () => {
      emitDocumentsChanged(['files', 'backlinks', 'graph']);
    });

    return () => {
      unsubscribe();
      provider.destroy();
      doc.destroy();
    };
  }, [queryClient]);

  return null;
}
