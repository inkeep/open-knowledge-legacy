import { humanFormat } from '@inkeep/open-knowledge-core';
import { useState } from 'react';
import { toast } from 'sonner';
import { useConfigContext } from '@/lib/config-provider';

type SyncEnabledWriter = (enabled: boolean) => { ok: true } | { ok: false; error: string };

export function useSyncEnabledWriter(): SyncEnabledWriter | null {
  const { projectLocalBinding } = useConfigContext();
  if (projectLocalBinding === null) return null;
  return (enabled: boolean) => {
    const result = projectLocalBinding.patch({ autoSync: { enabled } });
    return result.ok ? { ok: true } : { ok: false, error: humanFormat(result.error) };
  };
}

interface UseEnableSyncWithConfirmResult {
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  onToggleRequest: (next: boolean) => void;
  onConfirm: () => void;
}

export function useEnableSyncWithConfirm(
  writer: SyncEnabledWriter | null,
): UseEnableSyncWithConfirmResult {
  const [confirmOpen, setConfirmOpen] = useState(false);

  function applyEnabled(next: boolean): boolean {
    if (writer === null) {
      toast.error('Sync settings not yet loaded — try again in a moment');
      return false;
    }
    const result = writer(next);
    if (!result.ok) {
      console.error('[sync] toggle failed:', result.error);
      toast.error(`Failed to ${next ? 'enable' : 'disable'} sync — ${result.error}`);
      return false;
    }
    return true;
  }

  function onToggleRequest(next: boolean) {
    if (next) {
      setConfirmOpen(true);
      return;
    }
    applyEnabled(false);
  }

  function onConfirm() {
    const ok = applyEnabled(true);
    if (ok) setConfirmOpen(false);
  }

  return { confirmOpen, setConfirmOpen, onToggleRequest, onConfirm };
}
