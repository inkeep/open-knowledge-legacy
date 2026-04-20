/**
 * Shared raw lockfile inspector for `ok stop` / `ok clean` / `ok status`.
 *
 * Unlike `readProcessLock` (which auto-removes a stale same-host lock as a
 * side effect), `inspectLock` is a pure peek — it classifies the lock state
 * but never mutates the filesystem. `ok clean` specifically needs this so it
 * can report the number of pruned locks rather than discovering them already
 * gone after a read.
 */

import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import {
  isProcessAlive,
  type LockName,
  lockFilePath,
  type ProcessLockMetadata,
} from '@inkeep/open-knowledge-server';

export type LockState =
  | { status: 'missing'; lockPath: string }
  | { status: 'corrupt'; lockPath: string }
  | { status: 'foreign-host'; lockPath: string; lock: ProcessLockMetadata }
  | { status: 'dead-pid'; lockPath: string; lock: ProcessLockMetadata }
  | { status: 'alive'; lockPath: string; lock: ProcessLockMetadata };

interface InspectLockOptions {
  /** Override for tests. Defaults to `isProcessAlive` from the server package. */
  isAlive?: (pid: number) => boolean;
  /** Override for tests. Defaults to `os.hostname()`. */
  host?: string;
}

export function inspectLock(
  lockDir: string,
  lockName: LockName,
  opts: InspectLockOptions = {},
): LockState {
  const lockPath = lockFilePath(lockDir, lockName);
  if (!existsSync(lockPath)) return { status: 'missing', lockPath };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(lockPath, 'utf-8'));
  } catch {
    return { status: 'corrupt', lockPath };
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as { pid?: unknown }).pid !== 'number'
  ) {
    return { status: 'corrupt', lockPath };
  }
  const lock = parsed as ProcessLockMetadata;

  const localHost = opts.host ?? hostname();
  if (lock.hostname !== localHost) {
    return { status: 'foreign-host', lockPath, lock };
  }

  const aliveProbe = opts.isAlive ?? isProcessAlive;
  if (!aliveProbe(lock.pid)) {
    return { status: 'dead-pid', lockPath, lock };
  }
  return { status: 'alive', lockPath, lock };
}
