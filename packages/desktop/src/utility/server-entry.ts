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
import {
  type BootedServer,
  type BootServerOptions,
  ConfigSchema,
} from '@inkeep/open-knowledge-server';
import { type KeyringSmokeResult, runKeyringSmoke } from './keyring-smoke.ts';

export type { KeyringSmokeResult } from './keyring-smoke.ts';

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
  didGitInit: boolean;
}
export interface UtilityErrorMessage {
  type: 'error';
  message: string;
  stack?: string;
  kind?: 'lock-collision' | 'mcp-server-stuck' | 'mcp-server-killed';
  existingLock?: {
    pid: number;
    hostname: string;
    port: number;
    startedAt: string;
    worktreeRoot: string;
    kind?: 'interactive' | 'mcp-spawned';
    capabilities?: string[];
  };
}
export interface UtilityDegradedMessage {
  type: 'degraded';
  subsystems: readonly string[];
}
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

export interface SetupUtilityDeps {
  parentPort: {
    on(event: 'message', handler: (event: { data: unknown }) => void): void;
    postMessage(value: UtilityOutgoingMessage): void;
  } | null;
  importServer: () => Promise<typeof import('@inkeep/open-knowledge-server')>;
  exit: (code: number) => void;
  parentPid: number;
  killProbe: (pid: number, signal: number | string) => void;
  onSignal: (signal: 'SIGTERM' | 'SIGINT', handler: () => void) => void;
  setInterval: (cb: () => void, ms: number) => { unref?: () => void; clear: () => void };
  parentPollMs?: number;
  runSmoke?: () => Promise<KeyringSmokeResult>;
  env?: Record<string, string | undefined>;
  writeSmokeResult?: (path: string, contents: string) => Promise<void>;
}

export interface UtilityHandle {
  readyPromise: Promise<UtilityReadyMessage>;
  stopParentPoll(): void;
  shutdown(reason: string): Promise<void>;
}

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

  function startParentPoll() {
    const pollMs = deps.parentPollMs ?? 5000;
    parentPollHandle = deps.setInterval(() => {
      try {
        deps.killProbe(deps.parentPid, 0);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EPERM' || code === 'ESRCH') {
          void shutdown('parent-died');
          return;
        }
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
      const config = ConfigSchema.parse({});
      booted = await server.bootServer({
        ...msg.opts,
        config,
        attachUiSibling: false, // D36 — no `ok ui` sibling under Electron
        idleShutdownMs: null, // D36 — BrowserWindow lifecycle owns utility lifetime
        skipAutoInit: false,
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
        console.warn('[utility] auto-smoke write failed', {
          err: (err as Error).message,
          outPath,
        });
      }
    }
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

  if (env.OK_DEBUG_KEYRING_SMOKE === '1') {
    void runBootAutoSmoke();
  } else {
    registerMessageListener();
  }

  deps.onSignal('SIGTERM', () => void shutdown('SIGTERM'));
  deps.onSignal('SIGINT', () => void shutdown('SIGINT'));

  startParentPoll();

  return {
    readyPromise,
    stopParentPoll,
    shutdown,
  };
}

async function defaultWriteSmokeResult(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, contents, { encoding: 'utf-8' });
  await rename(tmp, path);
}

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
