import { useEffect, useRef, useState } from 'react';
import '@/lib/desktop-bridge-types';

export type UpdateChannel = 'latest' | 'beta';

interface UseUpdateChannelResult {
  readonly channel: UpdateChannel | null;
  setChannel(next: UpdateChannel): Promise<void>;
}

export function useUpdateChannel(): UseUpdateChannelResult {
  const [channel, setChannelState] = useState<UpdateChannel | null>(null);
  const broadcastReceivedRef = useRef(false);

  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
    if (!bridge) return;

    const unsubscribe = bridge.onChannelChanged(({ channel: next }) => {
      broadcastReceivedRef.current = true;
      setChannelState(next);
    });

    void bridge.state
      .query()
      .then((snap) => {
        if (broadcastReceivedRef.current) return;
        setChannelState(snap.channel);
      })
      .catch((err: unknown) => {
        console.warn('[use-update-channel] bridge.state.query() failed', err);
      });

    return unsubscribe;
  }, []);

  return {
    channel,
    setChannel: async (next: UpdateChannel) => {
      const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
      if (!bridge) {
        throw new Error('useUpdateChannel.setChannel called without desktop bridge');
      }
      await bridge.update.setChannel(next);
    },
  };
}
