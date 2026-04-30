/**
 * useEnableSyncWithConfirm — shared toggle wiring for the git auto-sync
 * Switch in the SyncStatusBadge popover and the SettingsPane Sync section.
 *
 * Off → on opens a confirmation dialog and only commits the POST after the
 * user confirms. On → off commits immediately (safe direction).
 *
 * The dialog state lives here so both surfaces share the same gate; the
 * caller renders <EnableSyncConfirmDialog> with the returned props.
 */
import { useState } from 'react';
import { toast } from 'sonner';

async function postSyncEnabled(enabled: boolean): Promise<void> {
  const res = await fetch('/api/sync/set-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    throw new Error(`set-enabled failed: HTTP ${res.status}`);
  }
}

interface UseEnableSyncWithConfirmResult {
  /** Whether a request is currently in flight. */
  toggling: boolean;
  /** Whether the confirmation dialog is open. */
  confirmOpen: boolean;
  /** Open/close the confirmation dialog (controlled). */
  setConfirmOpen: (open: boolean) => void;
  /** Call when the Switch fires onCheckedChange(next). */
  onToggleRequest: (next: boolean) => void;
  /** Call from the dialog's confirm button. */
  onConfirm: () => Promise<void>;
}

export function useEnableSyncWithConfirm(): UseEnableSyncWithConfirmResult {
  const [toggling, setToggling] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function applyEnabled(next: boolean): Promise<void> {
    setToggling(true);
    try {
      await postSyncEnabled(next);
    } catch (e) {
      console.error('[sync] toggle failed', e);
      toast.error(`Failed to ${next ? 'enable' : 'disable'} sync — try again`);
    }
    setToggling(false);
  }

  function onToggleRequest(next: boolean) {
    if (next) {
      // Off → on: gate behind the confirmation dialog.
      setConfirmOpen(true);
      return;
    }
    // On → off: commit immediately. Disabling is the safe direction.
    void applyEnabled(false);
  }

  async function onConfirm() {
    setConfirmOpen(false);
    await applyEnabled(true);
  }

  return { toggling, confirmOpen, setConfirmOpen, onToggleRequest, onConfirm };
}
