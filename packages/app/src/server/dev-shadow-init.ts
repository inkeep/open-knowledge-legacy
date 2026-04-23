/**
 * Pure helpers for the Vite dev plugin's module-scope shadow-init block —
 * the `void runDevShadowInit(...)` call site in `hocuspocus-plugin.ts`.
 * Extracted so the fail-fast branch (R6 / `ProjectGitInitError` →
 * `process.exit(1)`) + the degraded branch (other shadow-init failures →
 * warn + continue, production path only) can be unit-tested without
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
 *
 * Parallel path with `bootServer` (`packages/server/src/boot.ts:141`): both
 * accept a pre-`createServer` `ensureProjectGitFn` / `ensureProjectGit` hook,
 * but they diverge on error posture:
 *
 *   - `bootServer` rejects its returned `Promise<BootedServer>` on any
 *     `ensureProjectGitFn` throw (no try/catch — `boot.ts:155` comment
 *     "No try/catch — errors propagate (D12)"). The caller's `await` sees
 *     the rejection; there is no degraded-warn branch.
 *   - `runDevShadowInit` is fire-and-forget at module scope and dispatches
 *     through `handleDevShadowInitError`:
 *       * `ProjectGitInitError` → `exit(1)` (production AND isolation).
 *       * Any other error under `isTestIsolated: true` → `exit(1)` (D13,
 *         no silent degradation under test isolation).
 *       * Any other error under `isTestIsolated: false` (production /
 *         default) → degraded warn + continue (matches the CLI's
 *         transient-failure resilience).
 *
 * The two call sites are candidates for convergence in a later unification
 * spec (NG3 / D1 in specs/2026-04-22-per-worker-shadow-repo-test-harness/SPEC.md).
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
const defaultDevShadowInitIo: DevShadowInitIo = {
  logInfo: (msg) => console.log(msg),
  logWarn: (msg, err) => (err === undefined ? console.warn(msg) : console.warn(msg, err)),
  exit: (code) => process.exit(code) as never,
};

/**
 * The `.catch` handler for the dev plugin's shadow-init Promise chain.
 *
 * - `ProjectGitInitError` → R6 fail-fast: warn + stderr dump + `exit(1)`
 *   (production AND isolation — missing `git` is not a recoverable state).
 * - Any other error under `isTestIsolated: true` → fail-fast warn + `exit(1)`
 *   (D13 in specs/2026-04-22-per-worker-shadow-repo-test-harness/; silent
 *   degradation under isolation would mask coverage gaps).
 * - Any other error under `isTestIsolated: false` (default / production) →
 *   degraded warn; server continues without a shadow repo (matches the CLI's
 *   degraded semantics for transient shadow-init failures that are NOT
 *   git-missing).
 */
export function handleDevShadowInitError(
  err: unknown,
  io: DevShadowInitIo,
  opts: { isTestIsolated?: boolean } = {},
): void {
  // if/else if/else (not three bare ifs) so mutual exclusion is structural,
  // not dependent on io.exit being `never`. A future non-throwing test stub
  // must not fall through from one branch into the next.
  if (err instanceof ProjectGitInitError) {
    io.logWarn(`[dev] ensureProjectGit failed: ${err.message}`);
    if (err.stderr) io.logWarn(`[dev] git stderr: ${err.stderr.trim()}`);
    io.exit(1);
  } else if (opts.isTestIsolated) {
    io.logWarn('[dev] Shadow repo init failed under test isolation (fail-fast per D13):', err);
    io.exit(1);
  } else {
    io.logWarn('[dev] Shadow repo init failed (timeline features unavailable):', err);
  }
}

/**
 * Run the dev plugin's shadow-init pipeline:
 *
 *   ensureProjectGit(root) → initShadowRepo(root) → onReady(shadow)
 *
 * Errors flow through `handleDevShadowInitError`. Returns the Promise so
 * callers can await it in tests; production code calls it fire-and-forget.
 *
 * Tests pass stubs via `options.deps` (stubbing the two
 * @inkeep/open-knowledge-server primitives) and/or `options.io` (capturing
 * `console.*` + `process.exit` calls). `options.isTestIsolated: true`
 * broadens fail-fast to every shadow-init throw per D13.
 */
interface DevShadowInitDeps {
  ensureProjectGit: typeof ensureProjectGit;
  initShadowRepo: typeof initShadowRepo;
}

const defaultDevShadowInitDeps: DevShadowInitDeps = {
  ensureProjectGit,
  initShadowRepo,
};

interface DevShadowInitOptions {
  /** Override the production console/exit surface for tests. */
  io?: DevShadowInitIo;
  /** Stub the shadow-init primitives for tests. */
  deps?: DevShadowInitDeps;
  /**
   * When `true`, every shadow-init error (not just `ProjectGitInitError`)
   * produces `exit(1)`. Dev plugin threads through
   * `Boolean(process.env.OK_TEST_CONTENT_DIR)`; production callers leave
   * unset / pass `false` to preserve degraded-warn semantics. Default `false`.
   */
  isTestIsolated?: boolean;
}

export async function runDevShadowInit(
  projectRoot: string,
  onReady: (shadow: ShadowHandle) => void,
  options: DevShadowInitOptions = {},
): Promise<void> {
  const io = options.io ?? defaultDevShadowInitIo;
  const deps = options.deps ?? defaultDevShadowInitDeps;
  const isTestIsolated = options.isTestIsolated ?? false;
  try {
    await deps.ensureProjectGit(projectRoot);
    const shadow = await deps.initShadowRepo(projectRoot);
    onReady(shadow);
    io.logInfo(`[dev] Shadow repo initialized at ${shadow.gitDir}`);
  } catch (err) {
    handleDevShadowInitError(err, io, { isTestIsolated });
  }
}
