import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useEffect, useState } from 'react';
import type { AwarenessState, AwarenessUser } from './identity';

export interface Participant {
  clientId: number;
  user: AwarenessUser;
  mode: AwarenessState['mode'];
}

/**
 * Watches awareness.on('change') and returns an array of participants
 * with clientId, user info, and mode.
 */
export function usePresence(provider: HocuspocusProvider | null): Participant[] {
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    if (!provider) return;

    const awareness = provider.awareness;
    if (!awareness) return;

    const handler = () => {
      const entries = Array.from(awareness.getStates().entries());
      const result: Participant[] = [];
      for (const [clientId, state] of entries) {
        const s = state as Record<string, unknown>;
        if (s.user && typeof s.user === 'object') {
          result.push({
            clientId,
            user: s.user as Participant['user'],
            mode: (s.mode as Participant['mode']) ?? 'wysiwyg',
          });
        }
      }
      setParticipants(result);
    };

    // Initial read
    handler();

    awareness.on('change', handler);
    return () => {
      awareness.off('change', handler);
    };
  }, [provider]);

  return participants;
}
