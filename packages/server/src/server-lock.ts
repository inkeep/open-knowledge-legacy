/**
 * Server-level process lock — exclusive per-project server ownership.
 *
 * Only one Open Knowledge server process may own a given contentDir at a time.
 * The lock file at `<lockDir>/server.lock` contains JSON metadata used for
 * stale detection and for MCP port discovery.
 *
 * `lockDir` is `<contentDir>/.open-knowledge` by convention.
 *
 * Sibling of `shadow-lock.ts`: shadow-lock guards a shadow repo; server-lock
 * guards a whole server process. They share `process-alive.ts`.
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { isProcessAlive } from './process-alive.ts';

export interface ServerLockMetadata {
  pid: number;
  hostname: string;
  /** HTTP/WebSocket port the server listens on. 0 means "starting — port not yet bound". */
  port: number;
  startedAt: string;
  worktreeRoot: string;
}

export class ServerLockCollisionError extends Error {
  readonly existing: ServerLockMetadata;
  readonly lockPath: string;
  constructor(existing: ServerLockMetadata, lockPath: string) {
    super(
      `Open Knowledge server already running on port ${existing.port} ` +
        `(pid ${existing.pid}, started ${existing.startedAt}). ` +
        `Stop it first or use a different directory. Lock: ${lockPath}`,
    );
    this.name = 'ServerLockCollisionError';
    this.existing = existing;
    this.lockPath = lockPath;
  }
}

function lockFileFor(lockDir: string): string {
  return resolve(lockDir, 'server.lock');
}

/**
 * Acquire an exclusive server lock for a project's contentDir.
 *
 * `lockDir` is `<contentDir>/.open-knowledge`. Created if missing.
 *
 * - No existing lock → write ours, return lock path.
 * - Stale lock (dead pid OR foreign host) → replace with warning.
 * - Our own pid → idempotent rewrite (refreshes port/startedAt).
 * - Live foreign pid on same host → throw ServerLockCollisionError.
 * - Corrupt lock file → treat as stale.
 */
export function acquireServerLock(
  lockDir: string,
  init: { port: number; worktreeRoot: string },
): string {
  mkdirSync(lockDir, { recursive: true });
  const lockPath = lockFileFor(lockDir);

  if (existsSync(lockPath)) {
    let existing: ServerLockMetadata | null = null;
    try {
      const parsed = JSON.parse(readFileSync(lockPath, 'utf-8'));
      if (parsed && typeof parsed === 'object' && typeof parsed.pid === 'number') {
        existing = parsed as ServerLockMetadata;
      } else {
        console.warn(`[server-lock] Corrupt lock file at ${lockPath} — replacing`);
      }
    } catch {
      console.warn(`[server-lock] Corrupt lock file at ${lockPath} — replacing`);
    }

    if (existing) {
      const sameHost = existing.hostname === hostname();
      if (sameHost && existing.pid === process.pid) {
        // Idempotent — fall through to rewrite
      } else if (sameHost && isProcessAlive(existing.pid)) {
        throw new ServerLockCollisionError(existing, lockPath);
      } else {
        console.warn(
          `[server-lock] Stale lock detected (pid=${existing.pid}, host=${existing.hostname}) — replacing`,
        );
      }
    }
  }

  const metadata: ServerLockMetadata = {
    pid: process.pid,
    hostname: hostname(),
    port: init.port,
    startedAt: new Date().toISOString(),
    worktreeRoot: init.worktreeRoot,
  };

  writeFileSync(lockPath, JSON.stringify(metadata, null, 2), 'utf-8');
  return lockPath;
}

/**
 * Update only the port field in an already-acquired lock. Call after
 * `Server.listen()` resolves with a kernel-assigned port. Preserves all
 * other fields. No-op if the lock file is missing, corrupt, or not ours.
 */
export function updateServerLockPort(lockDir: string, port: number): void {
  const lockPath = lockFileFor(lockDir);
  if (!existsSync(lockPath)) return;

  let existing: ServerLockMetadata;
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.pid !== 'number') return;
    existing = parsed as ServerLockMetadata;
  } catch {
    return; // Corrupt or raced read — nothing to update
  }
  if (existing.pid !== process.pid) return; // Not ours — refuse to overwrite

  existing.port = port;
  try {
    writeFileSync(lockPath, JSON.stringify(existing, null, 2), 'utf-8');
  } catch (err) {
    console.warn(
      `[server-lock] Failed to update port in ${lockPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Read the server lock if it exists and the holder is alive on this host.
 * Returns null for missing, stale, cross-host, or corrupt locks. Cleans
 * up a stale lock as a side effect.
 */
export function readServerLock(lockDir: string): ServerLockMetadata | null {
  const lockPath = lockFileFor(lockDir);
  if (!existsSync(lockPath)) return null;

  let existing: ServerLockMetadata;
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.pid !== 'number') return null;
    existing = parsed as ServerLockMetadata;
  } catch {
    return null;
  }

  if (existing.hostname !== hostname()) return null;
  if (!isProcessAlive(existing.pid)) {
    try {
      unlinkSync(lockPath);
    } catch {
      // Raced another cleanup — fine
    }
    return null;
  }

  return existing;
}

/**
 * Release the server lock. Safe to call multiple times. Only removes the
 * lock if we own it (pid match) — prevents a rogue process from unlinking
 * a real server's lock.
 */
export function releaseServerLock(lockDir: string): void {
  const lockPath = lockFileFor(lockDir);
  if (!existsSync(lockPath)) return;
  try {
    const existing = JSON.parse(readFileSync(lockPath, 'utf-8')) as ServerLockMetadata;
    if (existing.pid !== process.pid) return;
    unlinkSync(lockPath);
  } catch (err) {
    console.warn(
      `[server-lock] Failed to release ${lockPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
