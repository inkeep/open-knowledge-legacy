import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { SyncStatus } from './use-sync-status';

const TOAST_ID = 'sync-status';

/**
 * Fires toasts on sync-status transitions: warning on disconnect, success on reconnect.
 * Silent on the happy path (connecting → connected → synced).
 */
export function useSyncToasts(status: SyncStatus, activeDocName: string | null) {
  const hasConnectedRef = useRef(false);
  const wasDisconnectedRef = useRef(false);

  const prevDocRef = useRef(activeDocName);

  useEffect(() => {
    if (prevDocRef.current !== activeDocName) {
      prevDocRef.current = activeDocName;
      hasConnectedRef.current = false;
      wasDisconnectedRef.current = false;
    }

    if (!activeDocName) return;

    if (status === 'synced') {
      hasConnectedRef.current = true;
    }

    if (status === 'disconnected' && hasConnectedRef.current) {
      wasDisconnectedRef.current = true;
      toast.warning(
        'Connection lost \u2014 keep this tab open, your edits will sync when reconnected',
        { id: TOAST_ID, duration: Infinity },
      );
    } else if (wasDisconnectedRef.current && status === 'synced') {
      wasDisconnectedRef.current = false;
      toast.success('Reconnected', { id: TOAST_ID, duration: 3000 });
    }
  }, [status, activeDocName]);
}
