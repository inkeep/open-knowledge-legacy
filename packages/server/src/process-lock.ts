/**
 * Process lock factory — shared primitive for per-project process ownership.
 *
 * Only one Open Knowledge process with a given `lockName` may own a lockDir
 * at a time. `lockDir` is `<contentDir>/.open-knowledge` by convention; the
 * lock file sits at `<lockDir>/<lockName>.lock` and contains JSON metadata
 * used for stale detection and port discovery.
 *
 * Used by both `server-lock.ts` (server.lock) and `ui-lock.ts` (ui.lock).
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { isProcessAlive } from './process-alive.ts';

export type LockName = 'server' | 'ui';

export interface ProcessLockMetadata {
  pid: number;
  hostname: string;
  /** HTTP/WebSocket port. 0 means "starting — port not yet bound". */
  port: number;
  startedAt: string;
  worktreeRoot: string;
}

export interface ProcessLockHandle {
  lockPath: string;
  release: () => void;
  updatePort: (port: number) => void;
}

export class ProcessLockCollisionError extends Error {
  readonly existing: ProcessLockMetadata;
  readonly lockPath: string;
  readonly lockName: LockName;
  constructor(existing: ProcessLockMetadata, lockPath: string, lockName: LockName) {
    super(
      `Open Knowledge ${lockName} already running on port ${existing.port} ` +
        `(pid ${existing.pid}, started ${existing.startedAt}). ` +
        `Stop it first or use a different directory. Lock: ${lockPath}`,
    );
    this.name = 'ProcessLockCollisionError';
    this.existing = existing;
    this.lockPath = lockPath;
    this.lockName = lockName;
  }
}

export function lockFilePath(lockDir: string, lockName: LockName): string {
  return resolve(lockDir, `${lockName}.lock`);
}

function parseLock(lockPath: string, logPrefix: string): ProcessLockMetadata | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && typeof parsed.pid === 'number') {
      return parsed as ProcessLockMetadata;
    }
    console.warn(`${logPrefix} Corrupt lock file at ${lockPath} — replacing`);
    return null;
  } catch {
    console.warn(`${logPrefix} Corrupt lock file at ${lockPath} — replacing`);
    return null;
  }
}

/**
 * Acquire an exclusive process lock.
 *
 * - No existing lock → write ours atomically via O_CREAT|O_EXCL.
 * - Stale lock (dead pid OR foreign host) → replace with warning.
 * - Our own pid → idempotent rewrite (refreshes port/startedAt).
 * - Live foreign pid on same host → throw ProcessLockCollisionError.
 * - Corrupt lock file → treat as stale.
 *
 * Create uses `openSync(path, 'wx')` (O_CREAT|O_EXCL) rather than a
 * check-then-write pattern so two concurrent `ok start` invocations cannot
 * both succeed via last-writer-wins. If we lose the create race, we
 * re-inspect the winner's lock (bounded retry) and classify it as any other
 * existing lock.
 *
 * Written with mode `0o600` — on shared multi-user hosts the lockfile
 * contents (pid, hostname, port, worktreeRoot) are owner-only.
 */
export function acquireProcessLock(opts: {
  lockName: LockName;
  lockDir: string;
  metadata: { port: number; worktreeRoot: string };
}): ProcessLockHandle {
  const { lockName, lockDir, metadata: init } = opts;
  const logPrefix = `[${lockName}-lock]`;

  mkdirSync(lockDir, { recursive: true });
  const lockPath = lockFilePath(lockDir, lockName);

  const record: ProcessLockMetadata = {
    pid: process.pid,
    hostname: hostname(),
    port: init.port,
    startedAt: new Date().toISOString(),
    worktreeRoot: init.worktreeRoot,
  };
  const payload = JSON.stringify(record, null, 2);

  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (!existsSync(lockPath)) {
      // Atomic create — only one writer wins the race against a concurrent
      // acquire attempting to grab the same file.
      try {
        const fd = openSync(lockPath, 'wx', 0o600);
        try {
          writeSync(fd, payload);
        } finally {
          closeSync(fd);
        }
        return buildHandle({ lockName, lockDir, lockPath });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        // EEXIST — another acquire raced us; fall through to re-inspect.
      }
    }

    const existing = parseLock(lockPath, logPrefix);
    if (existing) {
      const sameHost = existing.hostname === hostname();
      if (sameHost && existing.pid === process.pid) {
        // Idempotent rewrite — our own lock. Safe to overwrite in place;
        // O_EXCL is not needed here (we can't race ourselves).
        writeFileSync(lockPath, payload, { encoding: 'utf-8', mode: 0o600 });
        return buildHandle({ lockName, lockDir, lockPath });
      }
      if (sameHost && isProcessAlive(existing.pid)) {
        throw new ProcessLockCollisionError(existing, lockPath, lockName);
      }
      console.warn(
        `${logPrefix} Stale lock detected (pid=${existing.pid}, host=${existing.hostname}) — replacing`,
      );
    }

    // Stale or corrupt lock — unlink and retry the atomic create. Bounded so a
    // pathological loser (whose stale unlink keeps racing against a concurrent
    // create) can't spin forever.
    try {
      unlinkSync(lockPath);
    } catch {
      // Another acquire already unlinked — fine, fall through and retry.
    }
  }

  throw new Error(
    `${logPrefix} Failed to acquire ${lockPath} after ${MAX_ATTEMPTS} attempts (concurrent acquire contention).`,
  );
}

function buildHandle(args: {
  lockName: LockName;
  lockDir: string;
  lockPath: string;
}): ProcessLockHandle {
  const { lockName, lockDir, lockPath } = args;
  return {
    lockPath,
    release: () => releaseProcessLock({ lockName, lockDir }),
    updatePort: (port) => updateProcessLockPort({ lockName, lockDir, port }),
  };
}

/**
 * Update only the port field of our own lock. Preserves all other fields.
 * No-op if the lock file is missing, corrupt, or not ours.
 */
export function updateProcessLockPort(opts: {
  lockName: LockName;
  lockDir: string;
  port: number;
}): void {
  const { lockName, lockDir, port } = opts;
  const logPrefix = `[${lockName}-lock]`;
  const lockPath = lockFilePath(lockDir, lockName);

  if (!existsSync(lockPath)) {
    console.warn(`${logPrefix} Lock file missing at ${lockPath} during port update — skipping`);
    return;
  }

  let existing: ProcessLockMetadata;
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.pid !== 'number') {
      console.warn(`${logPrefix} Corrupt lock at ${lockPath} during port update — skipping`);
      return;
    }
    existing = parsed as ProcessLockMetadata;
  } catch {
    console.warn(`${logPrefix} Unreadable lock at ${lockPath} during port update — skipping`);
    return;
  }
  if (existing.pid !== process.pid) return;
  // Match the cross-host guard in releaseProcessLock — pid alone can collide
  // across hosts on a shared content volume (NFS, etc.).
  if (typeof existing.hostname === 'string' && existing.hostname !== hostname()) return;

  existing.port = port;
  try {
    // `mode: 0o600` — owner-only readable. Matches `acquireProcessLock`'s
    // atomic-create mode so port updates don't drop back to default (0644).
    writeFileSync(lockPath, JSON.stringify(existing, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (err) {
    console.warn(
      `${logPrefix} Failed to update port in ${lockPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Read the lock if it exists and the holder is alive on this host.
 * Returns null for missing, stale, cross-host, or corrupt locks. Cleans
 * up a stale lock as a side effect (same host, dead pid only).
 */
export function readProcessLock(opts: {
  lockName: LockName;
  lockDir: string;
}): ProcessLockMetadata | null {
  const { lockName, lockDir } = opts;
  const lockPath = lockFilePath(lockDir, lockName);
  if (!existsSync(lockPath)) return null;

  let existing: ProcessLockMetadata;
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.pid !== 'number') return null;
    existing = parsed as ProcessLockMetadata;
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
 * Release the lock. Safe to call multiple times. Only removes the lock if
 * we own it (pid AND hostname match) — prevents a rogue process from
 * unlinking a real server's lock. The hostname check matters on shared
 * content directories (NFS-mounted home, remote content volumes) where two
 * hosts can legitimately run processes with the same pid — without the
 * check we'd unlink a peer's lock.
 */
export function releaseProcessLock(opts: { lockName: LockName; lockDir: string }): void {
  const { lockName, lockDir } = opts;
  const logPrefix = `[${lockName}-lock]`;
  const lockPath = lockFilePath(lockDir, lockName);
  if (!existsSync(lockPath)) return;
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || typeof parsed.pid !== 'number') return;
    if (parsed.pid !== process.pid) return;
    if (typeof parsed.hostname === 'string' && parsed.hostname !== hostname()) return;
    unlinkSync(lockPath);
  } catch (err) {
    console.warn(
      `${logPrefix} Failed to release ${lockPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
