/**
 * utilityProcess entry — hosts Hocuspocus via `bootServer()` per project window.
 *
 * Lifecycle:
 *   1. Module load: register IPC + signal handlers, start parent-death poll
 *   2. `init` IPC from main → call `bootServer({ ...opts, attachUiSibling: false, idleShutdownMs: null })`
 *   3. On `bootedServer.ready` → post `{ type: 'ready', port, apiOrigin }` back to main
 *   4. On `shutdown` IPC OR SIGTERM/SIGINT OR parent death → drain + exit
 *
 * D36 opt-outs: no `ok ui` sibling (BrowserWindow IS the UI), no idle-shutdown
 * (BrowserWindow lifecycle owns this utility's lifetime).
 *
 * D49 parent-death detection: macOS has no PR_SET_PDEATHSIG, so we poll
 * `process.kill(parentPid, 0)` every 5s. If the parent dies (`EPERM` /
 * `ESRCH`), self-exit cleanly so the server.lock is released. Linux + Windows
 * variants are stubbed for M1 (per D51 macOS-only) — see code comments.
 *
 * R19 guard: this module MUST NOT import `attachIdleShutdown` from anywhere.
 * The Biome GritQL rule from US-012 will eventually enforce this; the comment
 * is the human-side reminder.
 */

import { rename, writeFile } from 'node:fs/promises';
import type { BootedServer, BootServerOptions } from '@inkeep/open-knowledge-server';
import { type KeyringSmokeResult, runKeyringSmoke } from './keyring-smoke.ts';

export type { KeyringSmokeResult } from './keyring-smoke.ts';

/** IPC payload shapes (utility ↔ main). */
export interface UtilityInitMessage {
  type: 'init';
  opts: Pick<
    BootServerOptions,
    'contentDir' | 'projectDir' | 'port' | 'host' | 'debounce' | 'maxDebounce'
  >;
}
export interface UtilityShutdownMessage {
  type: 'shutdown';
}
/**
 * Main → utility request to run the keyring smoke (M5 AC2, SPEC D-M5-2).
 * `correlationId` is echoed back on the result message so concurrent requests
 * resolve independently.
 */
export interface UtilityDebugKeyringSmokeMessage {
  type: 'debug-keyring-smoke';
  correlationId: string;
}
export type UtilityIncomingMessage =
  | UtilityInitMessage
  | UtilityShutdownMessage
  | UtilityDebugKeyringSmokeMessage;

export interface UtilityReadyMessage {
  type: 'ready';
  port: number;
  apiOrigin: string;
  /**
   * True when `ensureProjectGit` ran `git init` during this utility's boot.
   * Main-process ready-handler forwards this to the renderer via the
   * `ok:git-init-notice` push event (SPEC R5b / D10).
   */
  didGitInit: boolean;
}
export interface UtilityErrorMessage {
  type: 'error';
  message: string;
  stack?: string;
  /**
   * Distinguishes recoverable failure modes from generic errors so the
   * main process can pick a remediation path (auto-kill an MCP-spawned
   * lock holder vs. show a user dialog vs. log-only). Absent for the
   * default "something else went wrong" case — main treats it as the
   * existing showErrorBox path.
   */
  kind?: 'lock-collision' | 'mcp-server-stuck' | 'mcp-server-killed';
  /**
   * Present only on `kind: 'lock-collision'`. Lets the main process
   * inspect the colliding lock's `kind` / `parentPid` / `port` and decide
   * whether to auto-kill (mcp-spawned) or surface a dialog (interactive).
   */
  existingLock?: {
    pid: number;
    hostname: string;
    port: number;
    startedAt: string;
    worktreeRoot: string;
    kind?: 'interactive' | 'mcp-spawned';
    parentPid?: number;
    capabilities?: string[];
  };
}
export interface UtilityDegradedMessage {
  type: 'degraded';
  subsystems: readonly string[];
}
/**
 * Utility → main keyring-smoke result. Pairs with a prior
 * `UtilityDebugKeyringSmokeMessage`; the main-side relay matches by
 * `correlationId`.
 */
export interface UtilityDebugKeyringSmokeResultMessage {
  type: 'debug-keyring-smoke-result';
  correlationId: string;
  result: KeyringSmokeResult;
}
export type UtilityOutgoingMessage =
  | UtilityReadyMessage
  | UtilityErrorMessage
  | UtilityDegradedMessage
  | UtilityDebugKeyringSmokeResultMessage;

/**
 * Test seam — the entry script runs `setupUtility(...)` with real `parentPort` /
 * `process` deps; tests run it with mocks. Pure factory, no top-level side
 * effects.
 */
export interface SetupUtilityDeps {
  /** `process.parentPort` from utilityProcess context. Null in non-utility runtime. */
  parentPort: {
    on(event: 'message', handler: (event: { data: unknown }) => void): void;
    postMessage(value: UtilityOutgoingMessage): void;
  } | null;
  /** Function to import @inkeep/open-knowledge-server (injected so tests can mock). */
  importServer: () => Promise<typeof import('@inkeep/open-knowledge-server')>;
  /** `process.exit` injection for tests. */
  exit: (code: number) => void;
  /** Initial parent pid to monitor. Pass `process.ppid` from real entry. */
  parentPid: number;
  /** `process.kill(pid, signal)` injection. Tests pass a no-op or a tracker. */
  killProbe: (pid: number, signal: number | string) => void;
  /** Signal subscription for SIGTERM/SIGINT. */
  onSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
  /**
   * `setInterval` (injectable for tests). Returns a handle that supports
   * `clear()` so `stopParentPoll` can actually stop the interval — required
   * for test lifecycle and for any future shutdown path that doesn't
   * immediately exit the process.
   */
  setInterval: (cb: () => void, ms: number) => { unref?: () => void; clear: () => void };
  /** Poll cadence for parent-death check (ms). Default 5000. */
  parentPollMs?: number;
  /**
   * Keyring smoke runner — injectable for tests. Production defaults to
   * `runKeyringSmoke` from `./keyring-smoke.ts`.
   */
  runSmoke?: () => Promise<KeyringSmokeResult>;
  /**
   * Environment provider — `process.env` in production. Tests inject a
   * plain object so `OK_DEBUG_KEYRING_SMOKE*` can be toggled per test
   * without leaking into sibling tests.
   */
  env?: Record<string, string | undefined>;
  /**
   * Atomic file writer for the boot-time smoke output (SPEC US-005).
   * Production writes via `fs.promises.writeFile` to a tmp path then
   * `rename` to the final path. Tests inject a spy so output filename and
   * payload can be asserted without touching the filesystem.
   */
  writeSmokeResult?: (path: string, contents: string) => Promise<void>;
}

export interface UtilityHandle {
  /** Resolves once the utility has booted (after `ready` IPC fired). Tests await this. */
  readyPromise: Promise<UtilityReadyMessage>;
  /** Cancel the parent-death polling interval (called on shutdown). */
  stopParentPoll(): void;
  /** Run the drain sequence + exit. Idempotent. */
  shutdown(reason: string): Promise<void>;
}

/**
 * Wire up the utility-process IPC + lifecycle. Called once at module load with
 * real deps in production; tests call it with mocks to assert each branch.
 */
export function setupUtility(deps: SetupUtilityDeps): UtilityHandle {
  let booted: BootedServer | null = null;
  let parentPollHandle: { unref?: () => void; clear: () => void } | null = null;
  let shuttingDown = false;
  let resolveReady!: (msg: UtilityReadyMessage) => void;
  let rejectReady!: (err: Error) => void;
  const readyPromise = new Promise<UtilityReadyMessage>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  // Parent-death polling (D49 macOS path).
  // Linux: should use `prctl(PR_SET_PDEATHSIG, SIGTERM)` at process startup,
  // but that requires a native addon — for M1 (macOS-only per D51) we use the
  // poll path on all platforms. M2+ Windows would use Job Objects per D49.
  function startParentPoll() {
    const pollMs = deps.parentPollMs ?? 5000;
    parentPollHandle = deps.setInterval(() => {
      try {
        deps.killProbe(deps.parentPid, 0);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EPERM' || code === 'ESRCH') {
          // Parent is gone — self-exit cleanly.
          void shutdown('parent-died');
          return;
        }
        // Unknown errno (e.g. ENOSYS on an unusual sandbox, EACCES in some
        // container configurations). Log and continue polling so an
        // unexpected kernel signal doesn't silently erase this defense —
        // D49 names this as the whole reason the poll exists. Log-only
        // (not self-exit) because false-positive self-exits on a live
        // parent would churn utility processes for no reason.
        console.warn('[utility] parent-poll unexpected errno — continuing', {
          code: code ?? '(missing)',
          parentPid: deps.parentPid,
        });
      }
    }, pollMs);
    parentPollHandle.unref?.();
  }

  function stopParentPoll() {
    parentPollHandle?.clear();
    parentPollHandle = null;
  }

  async function shutdown(reason: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    stopParentPoll();
    let drainOk = true;
    if (booted) {
      try {
        await booted.destroy();
      } catch (err) {
        // Report via IPC AND exit non-zero. The parent correlates the error
        // IPC with the non-zero exit code; silently exiting 0 on a failed
        // drain hides shutdown failures (stuck watcher, shadow-lock release
        // failure, L2 flush mid-write) and lets them accumulate across
        // restarts. CLAUDE.md CC8 shutdown-ordering explicitly wraps phase-6
        // lock release in try/finally so a mid-shutdown throw still releases
        // — the utility wrapper must not silently convert that throw to exit 0.
        drainOk = false;
        deps.parentPort?.postMessage({
          type: 'error',
          message: `destroy failed during ${reason}: ${(err as Error).message}`,
          stack: (err as Error).stack,
        });
      }
    }
    deps.exit(drainOk ? 0 : 1);
  }

  async function handleInit(msg: UtilityInitMessage) {
    try {
      const server = await deps.importServer();
      booted = await server.bootServer({
        ...msg.opts,
        attachUiSibling: false, // D36 — no `ok ui` sibling under Electron
        idleShutdownMs: null, // D36 — BrowserWindow lifecycle owns utility lifetime
        skipAutoInit: false,
        // SPEC R2 / D12: ensureProjectGit runs BEFORE listen(), failure
        // propagates out of bootServer → caught below → error IPC + exit(1).
        ensureProjectGitFn: () =>
          server.ensureProjectGit(msg.opts.projectDir ?? msg.opts.contentDir),
      });
      const readyMsg: UtilityReadyMessage = {
        type: 'ready',
        port: booted.port,
        apiOrigin: `http://localhost:${booted.port}`,
        didGitInit: booted.didGitInit,
      };
      deps.parentPort?.postMessage(readyMsg);
      resolveReady(readyMsg);

      if (booted.degraded.length > 0) {
        deps.parentPort?.postMessage({
          type: 'degraded',
          subsystems: booted.degraded,
        });
      }
    } catch (err) {
      const errMsg: UtilityErrorMessage = {
        type: 'error',
        message: (err as Error).message,
        stack: (err as Error).stack,
      };
      // Surface lock-collision metadata to the main process so it can
      // decide whether to auto-kill an MCP-spawned holder vs. show a
      // user-blocking dialog. We compare on `name` (not instanceof)
      // because `bootServer` is dynamically imported and the class
      // identity may differ across module-realm boundaries.
      if (err && typeof err === 'object' && (err as Error).name === 'ServerLockCollisionError') {
        const existing = (err as { existing?: UtilityErrorMessage['existingLock'] }).existing;
        if (existing) {
          errMsg.kind = 'lock-collision';
          errMsg.existingLock = existing;
        }
      }
      deps.parentPort?.postMessage(errMsg);
      rejectReady(err as Error);
      deps.exit(1);
    }
  }

  const runSmoke = deps.runSmoke ?? runKeyringSmoke;
  const env = deps.env ?? (process.env as Record<string, string | undefined>);
  const writeSmokeResult = deps.writeSmokeResult ?? defaultWriteSmokeResult;

  async function handleDebugKeyringSmoke(msg: UtilityDebugKeyringSmokeMessage): Promise<void> {
    const result = await runSmoke();
    deps.parentPort?.postMessage({
      type: 'debug-keyring-smoke-result',
      correlationId: msg.correlationId,
      result,
    });
  }

  function registerMessageListener(): void {
    deps.parentPort?.on('message', (event) => {
      const msg = event.data as UtilityIncomingMessage;
      if (msg?.type === 'init') {
        void handleInit(msg);
      } else if (msg?.type === 'shutdown') {
        void shutdown('shutdown-ipc');
      } else if (msg?.type === 'debug-keyring-smoke') {
        void handleDebugKeyringSmoke(msg);
      }
    });
  }

  async function runBootAutoSmoke(): Promise<void> {
    const result = await runSmoke();
    const outPath = env.OK_DEBUG_KEYRING_SMOKE_OUT;
    if (outPath && outPath.length > 0) {
      try {
        await writeSmokeResult(outPath, `${JSON.stringify(result)}\n`);
      } catch (err) {
        // Non-fatal: log + continue so a permissions failure on the output
        // path doesn't leave the driver hung waiting for an exit that never
        // comes. The driver's missing-output-file branch (US-006 AC) will
        // surface this on its side.
        console.warn('[utility] auto-smoke write failed', {
          err: (err as Error).message,
          outPath,
        });
      }
    }
    // Observability-only IPC for the dev-mode auto-smoke path — `correlationId:
    // 'auto-boot'` will never match a pending entry in the main-side relay's
    // correlation Map (the renderer doesn't register 'auto-boot' as a pending
    // id), so `handleUtilityMessage` drops it on the floor. We still post it
    // because: (a) SPEC US-005 mandates the IPC regardless of EXIT mode, (b)
    // an existing test pins the shape, and (c) a future DevTools listener
    // that wants to watch auto-boot results can filter on the sentinel id
    // without a server-entry code change. Under EXIT=1 the post is best-effort
    // fire-and-forget (the process is about to exit); the driver script reads
    // the OUT file, not this IPC.
    deps.parentPort?.postMessage({
      type: 'debug-keyring-smoke-result',
      correlationId: 'auto-boot',
      result,
    });
    if (env.OK_DEBUG_KEYRING_SMOKE_EXIT === '1') {
      deps.exit(0);
      return;
    }
    registerMessageListener();
  }

  // SPEC D-M5-6 — when OK_DEBUG_KEYRING_SMOKE=1 is set, the utility runs the
  // smoke ONCE at boot, BEFORE the `init` message is dispatched. Node.js
  // buffers messages posted to parentPort until a listener is registered, so
  // delaying `registerMessageListener()` until after the smoke completes
  // guarantees the ordering without dropping messages.
  if (env.OK_DEBUG_KEYRING_SMOKE === '1') {
    void runBootAutoSmoke();
  } else {
    registerMessageListener();
  }

  // Signal handlers
  deps.onSignal('SIGTERM', () => void shutdown('SIGTERM'));
  deps.onSignal('SIGINT', () => void shutdown('SIGINT'));

  // Parent-death poll
  startParentPoll();

  return {
    readyPromise,
    stopParentPoll,
    shutdown,
  };
}

/**
 * Default atomic file writer for the smoke output — write to `<path>.tmp`
 * then `rename` to `<path>`, so a reader never sees a partially-written
 * payload. The driver script (US-006) is the primary consumer.
 */
async function defaultWriteSmokeResult(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, contents, { encoding: 'utf-8' });
  await rename(tmp, path);
}

// Production entry — auto-runs when imported by `utilityProcess.fork(<this-file>)`.
// `process.parentPort` is non-null in utility runtime; tests import the module
// without triggering this branch by checking `process.parentPort` themselves
// (it's null in regular Node).
if ((process as NodeJS.Process & { parentPort?: unknown }).parentPort) {
  setupUtility({
    parentPort: (process as NodeJS.Process & { parentPort: SetupUtilityDeps['parentPort'] })
      .parentPort,
    importServer: () => import('@inkeep/open-knowledge-server'),
    exit: (code) => process.exit(code),
    parentPid: process.ppid,
    killProbe: (pid, signal) => {
      process.kill(pid, signal as NodeJS.Signals | 0);
    },
    onSignal: (signal, handler) => {
      process.on(signal, handler);
    },
    setInterval: (cb, ms) => {
      const handle = setInterval(cb, ms);
      return {
        unref: () => handle.unref(),
        clear: () => clearInterval(handle),
      };
    },
  });
}
