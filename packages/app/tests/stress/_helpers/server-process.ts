import type { ChildProcess } from 'node:child_process';
import { type AddressInfo, createServer as createNetServer } from 'node:net';
import { setTimeout as wait } from 'node:timers/promises';

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.once('error', reject);
    s.listen(0, () => {
      const port = (s.address() as AddressInfo).port;
      s.close(() => resolve(port));
    });
  });
}

export async function waitForHttpReady(baseURL: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseURL}/`, { signal: AbortSignal.timeout(1000) });
      if (res.status === 200 || res.status === 404) return;
      lastErr = new Error(`unexpected status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await wait(250);
  }
  throw new Error(
    `dev server at ${baseURL} did not become ready within ${timeoutMs}ms. Last error: ${String(lastErr)}`,
  );
}

export async function killGracefully(proc: ChildProcess, timeoutMs = 5000): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));
  try {
    proc.kill('SIGTERM');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
    return;
  }
  await Promise.race([exited, wait(timeoutMs)]);
  if (proc.exitCode === null && proc.signalCode === null) {
    try {
      proc.kill('SIGKILL');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ESRCH') throw err;
    }
    await exited;
  }
}
