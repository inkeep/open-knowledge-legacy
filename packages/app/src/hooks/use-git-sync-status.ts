/**
 * Hook for subscribing to the sync engine state via CC1 `sync-status` channel.
 *
 * Fetches `GET /api/sync/status` on mount and whenever the server emits a
 * `ch:'sync-status'` CC1 signal. Returns null until the first response arrives.
 */
import { useEffect, useState } from 'react';
import { subscribeToDocumentsChanged } from '@/lib/documents-events';

export type GitSyncState =
  | 'dormant'
  | 'idle'
  | 'fetching'
  | 'pulling'
  | 'pushing'
  | 'conflict'
  | 'offline'
  | 'auth-error'
  | 'disabled';

export interface GitSyncStatus {
  state: GitSyncState;
  lastSyncUtc: string | null;
  lastFetchUtc: string | null;
  ahead: number;
  behind: number;
  conflictCount: number;
  /** True when a git remote exists, even if sync is dormant/disabled. */
  hasRemote: boolean;
  error?: string;
  pausedReason?: string;
}

async function fetchSyncStatus(): Promise<GitSyncStatus | null> {
  try {
    const res = await fetch('/api/sync/status');
    if (!res.ok) return null;
    return (await res.json()) as GitSyncStatus;
  } catch {
    return null;
  }
}

export function useGitSyncStatus(): GitSyncStatus | null {
  const [status, setStatus] = useState<GitSyncStatus | null>(null);

  function refresh() {
    void fetchSyncStatus().then((s) => {
      if (s) setStatus(s);
    });
  }

  // Initial fetch on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is intentionally stable (defined in component scope)
  useEffect(() => {
    refresh();
  }, []);

  // Re-fetch on CC1 sync-status signal
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh is intentionally stable (defined in component scope)
  useEffect(() => {
    return subscribeToDocumentsChanged((channels) => {
      if (channels.includes('sync-status')) {
        refresh();
      }
    });
  }, []);

  return status;
}
