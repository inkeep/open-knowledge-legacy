/**
 * Check whether a process with the given pid is still alive on this host.
 *
 * `process.kill(pid, 0)` sends no signal but throws if the pid does not exist.
 * EPERM means the process exists but we lack permission to signal it — still alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EPERM') {
      return true;
    }
    return false;
  }
}
