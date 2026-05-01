/**
 * Shared client helpers for the `/api/sync/*` endpoints.
 *
 * Centralized so the on/off transport (CSRF, error shape, future fetch
 * abstraction) only needs to change in one place. Consumers: the auto-sync
 * onboarding dialog, the SyncStatusBadge popover Switch, and the SettingsPane
 * Sync section (via useEnableSyncWithConfirm).
 */

export async function postSyncEnabled(enabled: boolean): Promise<void> {
  const res = await fetch('/api/sync/set-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    throw new Error(`set-enabled failed: HTTP ${res.status}`);
  }
}
