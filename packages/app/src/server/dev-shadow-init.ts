/**
 * Pure helpers for the Vite dev plugin's module-scope shadow-init block at
 * `hocuspocus-plugin.ts:148-162`. Extracted so the fail-fast branch (R6 /
 * `ProjectGitInitError` → `process.exit(1)`) + the degraded branch (other
 * shadow-init failures → warn + continue) can be unit-tested without
 * evaluating the plugin's module side effects.
 *
 * The Vite plugin remains module-top-level (Vite's plugin contract expects
 * init at import time) — this file just exposes the two pure pieces:
 *
 *   1. `runDevShadowInit` — the Promise chain that runs on module load.
 *   2. `handleDevShadowInitError` — the `.catch` branch's dispatch logic.
 *
 * Both take injectable `log` / `exit` deps so tests can observe behavior
 * without spawning a real subprocess.
 */
import {
  ensureProjectGit,
  initShadowRepo,
  ProjectGitInitError,
  type ShadowHandle,
} from '@inkeep/open-knowledge-server';

/** Slim subset of the `console` / `process.exit` surface the helpers touch. */
export interface DevShadowInitIo {
  logInfo: (msg: string) => void;
  logWarn: (msg: string, err?: unknown) => void;
  exit: (code: number) => never;
}

/** Production IO — injected by default inside the plugin. */
export const defaultDevShadowInitIo: DevShadowInitIo = {
  logInfo: (msg) => console.log(msg),
  logWarn: (msg, err) => (err === undefined ? console.warn(msg) : console.warn(msg, err)),
  exit: (code) => process.exit(code) as never,
};

/**
 * The `.catch` handler for the dev plugin's shadow-init Promise chain.
 *
 * - `ProjectGitInitError` → R6 fail-fast: warn + stderr dump + `exit(1)`.
 * - Any other error → degraded warn (timeline features unavailable), do not
 *   exit; the server continues without a shadow repo (matches CLI degraded
 *   semantics for transient shadow-init failures that are NOT git-missing).
 */
export function handleDevShadowInitError(err: unknown, io: DevShadowInitIo): void {
  if (err instanceof ProjectGitInitError) {
    io.logWarn(`[dev] ensureProjectGit failed: ${err.message}`);
    if (err.stderr) io.logWarn(`[dev] git stderr: ${err.stderr.trim()}`);
    io.exit(1);
    return;
  }
  io.logWarn('[dev] Shadow repo init failed (timeline features unavailable):', err);
}

/**
 * Run the dev plugin's shadow-init pipeline:
 *
 *   ensureProjectGit(root) → initShadowRepo(root) → onReady(shadow)
 *
 * Errors flow through `handleDevShadowInitError`. Returns the Promise so
 * callers can await it in tests; production code calls it fire-and-forget.
 *
 * Injectable `deps` let tests stub the two @inkeep/open-knowledge-server
 * primitives; production passes the real ones.
 */
export interface DevShadowInitDeps {
  ensureProjectGit: typeof ensureProjectGit;
  initShadowRepo: typeof initShadowRepo;
}

export const defaultDevShadowInitDeps: DevShadowInitDeps = {
  ensureProjectGit,
  initShadowRepo,
};

export async function runDevShadowInit(
  projectRoot: string,
  onReady: (shadow: ShadowHandle) => void,
  io: DevShadowInitIo = defaultDevShadowInitIo,
  deps: DevShadowInitDeps = defaultDevShadowInitDeps,
): Promise<void> {
  try {
    await deps.ensureProjectGit(projectRoot);
    const shadow = await deps.initShadowRepo(projectRoot);
    onReady(shadow);
    io.logInfo(`[dev] Shadow repo initialized at ${shadow.gitDir}`);
  } catch (err) {
    handleDevShadowInitError(err, io);
  }
}
