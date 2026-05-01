import type * as Y from 'yjs';
import type { AgentFlashEntry } from '../types/awareness';

export const FLASH_DURATION_MS = 2000;

export const FLASH_DEBOUNCE_MS = 500;

export const ACTIVITY_TTL_MS = 30_000;

export function evictStaleEntries(activityMap: Y.Map<unknown>): void {
  const now = Date.now();
  for (const [key, value] of activityMap.entries()) {
    const entry = value as AgentFlashEntry;
    if (entry.timestamp && now - entry.timestamp > ACTIVITY_TTL_MS) {
      activityMap.delete(key);
    }
  }
}

export function hasNewEntries(activityMap: Y.Map<unknown>, since: number): boolean {
  for (const [, value] of activityMap.entries()) {
    const entry = value as AgentFlashEntry;
    if (entry.timestamp && entry.timestamp > since) {
      return true;
    }
  }
  return false;
}
