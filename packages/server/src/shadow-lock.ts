/**
 * Shadow-root writer lock — exclusive access to a shadow repo.
 *
 * Only one active writer instance may mutate a given shadow root at a time.
 * The lock file at `<shadowDir>/lock` contains JSON metadata for stale
 * detection: pid, hostname, startedAt, worktreeRoot.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';

export interface LockMetadata {
  pid: number;
  hostname: string;
  startedAt: string;
  worktreeRoot: string;
}

/** Check whether a process with the given pid is still alive. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    // EPERM means the process exists but we lack permission to signal it
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EPERM') {
      return true;
    }
    return false;
  }
}

/**
 * Acquire an exclusive writer lock on a shadow repo directory.
 *
 * - If no lock exists, creates one and returns the lock path.
 * - If a lock exists with a dead owner, replaces it with a warning log.
 * - If a lock exists with a live owner, throws a descriptive error.
 */
export function acquireLock(shadowDir: string, worktreeRoot: string): string {
  const lockPath = resolve(shadowDir, 'lock');

  if (existsSync(lockPath)) {
    let existing: LockMetadata | null = null;
    try {
      existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as LockMetadata;
    } catch {
      // Corrupt lock file — treat as stale
      console.warn(`[shadow-lock] Corrupt lock file at ${lockPath} — replacing`);
    }

    if (existing) {
      const sameHost = existing.hostname === hostname();
      // Same process re-acquiring — idempotent
      if (sameHost && existing.pid === process.pid) {
        // Update the lock metadata (e.g. worktreeRoot may differ)
      } else if (sameHost && isProcessAlive(existing.pid)) {
        throw new Error(
          `Shadow repo at ${shadowDir} is locked by another writer ` +
            `(pid=${existing.pid}, worktree=${existing.worktreeRoot}, ` +
            `started=${existing.startedAt}). ` +
            `Only one active writer instance may mutate a given shadow root at a time.`,
        );
      }
      // Owner is dead or on a different host — stale lock
      console.warn(
        `[shadow-lock] Stale lock detected (pid=${existing.pid}, host=${existing.hostname}) — replacing`,
      );
    }
  }

  const metadata: LockMetadata = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    worktreeRoot,
  };

  writeFileSync(lockPath, JSON.stringify(metadata, null, 2), 'utf-8');
  return lockPath;
}

/**
 * Release the shadow-root writer lock.
 *
 * Safe to call multiple times — silently no-ops if lock doesn't exist.
 */
export function releaseLock(shadowDir: string): void {
  const lockPath = resolve(shadowDir, 'lock');
  try {
    unlinkSync(lockPath);
  } catch {
    // Lock already removed or never created
  }
}
