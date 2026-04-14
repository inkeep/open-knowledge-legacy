/**
 * Safe localStorage getter — returns null on any access error (Safari private
 * browsing, iframe sandboxing, user-disabled storage). Without this guard, the
 * entire editor mount crashes in private browsing mode.
 */
export function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safe localStorage setter — silently no-ops on error. */
export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Swallow — QuotaExceededError in private browsing, etc.
  }
}
