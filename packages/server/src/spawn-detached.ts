import { spawn as nodeSpawn } from 'node:child_process';

export type SpawnDetachedOutcome =
  | { ok: true }
  | { ok: false; reason: 'not-installed' | 'timeout' | 'spawn-error' };

export function spawnDetached(
  exec: string,
  args: ReadonlyArray<string>,
  timeoutMs: number,
): Promise<SpawnDetachedOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: SpawnDetachedOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const timer = setTimeout(() => settle({ ok: false, reason: 'timeout' }), timeoutMs);
    try {
      const child = nodeSpawn(exec, [...args], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      });
      child.once('error', (err) => {
        clearTimeout(timer);
        const msg = err instanceof Error ? err.message : String(err);
        const reason: SpawnDetachedOutcome = /ENOENT|EACCES|EPERM/.test(msg)
          ? { ok: false, reason: 'not-installed' }
          : { ok: false, reason: 'spawn-error' };
        settle(reason);
      });
      queueMicrotask(() => {
        if (settled) return;
        try {
          child.unref();
        } catch {}
        clearTimeout(timer);
        settle({ ok: true });
      });
    } catch (err) {
      console.warn('[spawn-detached] synchronous spawn throw:', err);
      clearTimeout(timer);
      settle({ ok: false, reason: 'spawn-error' });
    }
  });
}
