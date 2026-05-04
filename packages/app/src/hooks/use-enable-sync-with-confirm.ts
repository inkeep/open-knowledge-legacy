import { useState } from 'react';
import { toast } from 'sonner';
import { postSyncEnabled } from '@/lib/sync-api';

interface UseEnableSyncWithConfirmResult {
  toggling: boolean;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  onToggleRequest: (next: boolean) => void;
  onConfirm: () => Promise<void>;
}

export function useEnableSyncWithConfirm(): UseEnableSyncWithConfirmResult {
  const [toggling, setToggling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function applyEnabled(next: boolean): Promise<boolean> {
    setToggling(true);
    try {
      await postSyncEnabled(next);
    } catch (e) {
      console.error('[sync] toggle failed', e);
      toast.error(`Failed to ${next ? 'enable' : 'disable'} sync — try again`);
      setToggling(false);
      return false;
    }
    setToggling(false);
    return true;
  }

  function onToggleRequest(next: boolean) {
    if (next) {
      setConfirmOpen(true);
      return;
    }
    void applyEnabled(false);
  }

  async function onConfirm() {
    const ok = await applyEnabled(true);
    if (ok) setConfirmOpen(false);
  }

  return { toggling, confirmOpen, setConfirmOpen, onToggleRequest, onConfirm };
}
