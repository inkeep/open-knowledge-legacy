/**
 * `bootServer` — HTTP + WebSocket wrapping layer around `createServer()`.
 *
 * Three consumers share this composed boot path:
 *   1. CLI `ok start` (via `bootStartServer` in packages/cli)
 *   2. Electron utility process (direct import — precedent #14-adjacent, D35)
 *   3. Integration tests
 *
 * Before this extraction (D35) every consumer reimplemented HTTP + WS upgrade
 * + `listen()` + `updateServerLockPort` + idle-shutdown + composite destroy.
 * The extraction consolidates those ~150 LOC here so all three callers share
 * a single tested orchestrator.
 *
 * Opt-outs (D36 — Electron utility uses these):
 *   - `attachUiSibling: false` — suppress UI-sibling spawn flow
 *   - `idleShutdownMs: null` — disable idle-shutdown entirely
 *   - `skipAutoInit: true` — skip the pre-createServer scaffold hook
 *
 * CLI-specific concerns (`initContent`, `spawnOkUi`, banner, signal handlers)
 * are NOT part of bootServer — the CLI wrapper layers them on top via
 * injected callbacks + post-return orchestration.
 */
import type { Server as HttpServer } from 'node:http';
import { attachIdleShutdown, type IdleShutdownHandle } from './idle-shutdown.ts';
import { getLogger, type PinoLogger } from './logger.ts';
import { handleCollabSocketError } from './metrics.ts';
import { createServer, type ServerInstance, type ServerOptions } from './standalone.ts';

/** 30 minutes — matches SPEC §9 default threshold. */
const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

export interface BootServerOptions
  extends Pick<
    ServerOptions,
    | 'contentDir'
    | 'projectDir'
    | 'contentRoot'
    | 'port'
    | 'host'
    | 'quiet'
    | 'debounce'
    | 'maxDebounce'
    | 'gitEnabled'
    | 'commitDebounceMs'
    | 'wipRef'
    | 'includePatterns'
    | 'excludePatterns'
    | 'destroyTimeoutMs'
    | 'localOpCliArgs'
    | 'onAgentWrite'
    | 'shadowRepo'
    | 'enableTestRoutes'
  > {
  /**
   * If false, `bootServer` does NOT run the pre-createServer `autoInitFn` or
   * invoke UI-sibling spawn logic. Default false.
   */
  skipAutoInit?: boolean;
  /**
   * If false, UI-sibling callbacks (`spawnUiSiblingFn` / `onSkipUiSpawn`) are
   * NOT invoked regardless of `spawnUiSiblingFn` presence. Default true —
   * preserves CLI back-compat when the flag is omitted.
   *
   * Electron utility sets this to `false` (D36): the BrowserWindow IS the UI
   * surface; there is no `ok ui` sibling to spawn.
   */
  attachUiSibling?: boolean;
  /**
   * Idle-shutdown threshold in milliseconds. `null` disables idle-shutdown
   * entirely (Electron utility sets this to `null` per D36 — window lifecycle
   * owns utility lifetime). Default 30 * 60 * 1000.
   */
  idleShutdownMs?: number | null;
  /**
   * Pre-createServer scaffolding hook. CLI injects `initContent`; desktop
   * leaves this undefined (no-op). Called only when `skipAutoInit === false`.
   * Returns `true` if any scaffolding occurred during this invocation.
   */
  autoInitFn?: () => boolean | Promise<boolean>;
  /**
   * Pre-createServer fail-fast hook for ensuring the project has a `.git/`
   * directory. CLI + Vite dev plugin + integration test harness inject
   * `ensureProjectGit`; desktop utility passes it through from its own import.
   * Called only when `skipAutoInit === false`. Runs BEFORE `autoInitFn` and
   * BEFORE `httpServer.listen()` so that on failure, `bootServer` rejects
   * before any port is bound (SPEC D12 — no degraded fallback).
   */
  ensureProjectGitFn?: () => Promise<{ didInit: boolean }>;
  /**
   * CLI-specific UI-sibling spawn orchestration. Called once after the server
   * has bound a port IF `attachUiSibling !== false`. Receives `lockDir` so the
   * CLI's spawn helper can read the current ui.lock + decide whether to spawn.
   */
  spawnUiSiblingFn?: (ctx: { lockDir: string; log: PinoLogger }) => void | Promise<void>;
  /**
   * Idle-shutdown handler — run when the server has been idle past the
   * threshold. The CLI passes a handler that SIGTERMs the `ok ui` sibling
   * before calling `destroyServer()`; the desktop utility never wires this
   * handler because `idleShutdownMs: null`.
   */
  idleShutdownHandler?: (destroyServer: () => Promise<void>) => () => Promise<void>;
  /** Injectable logger. Defaults to `getLogger('boot')`. */
  log?: PinoLogger;
}

export interface BootedServer {
  /** The bound HTTP server listening on `port`. */
  httpServer: HttpServer;
  /** Composite shutdown — closes httpServer, detaches idle-shutdown, destroys the Hocuspocus server (which releases server.lock). */
  destroy: () => Promise<void>;
  /** Absolute path to `<contentDir>/.open-knowledge`. */
  lockDir: string;
  /** Resolved content directory. */
  contentDir: string;
  /** The kernel-assigned port `httpServer` is bound to. */
  port: number;
  /** Resolves when async server init (shadow repo, file watcher subscription) completes. */
  ready: Promise<void>;
  /** Subsystems that failed to initialize — read AFTER `ready` for a stable list. */
  degraded: readonly string[];
  /** `true` if `autoInitFn` scaffolded anything during this boot. */
  didAutoInit: boolean;
  /** `true` if `ensureProjectGitFn` ran `git init` during this boot. `false` when the hook was omitted or the project already had `.git/`. */
  didGitInit: boolean;
  /** Full ServerInstance from createServer — exposed for advanced consumers (e.g., desktop utility's drain sequencing). */
  serverInstance: ServerInstance;
}

/**
 * Boot the collab server end-to-end and return a handle. Pure of process-level
 * concerns (signal handlers, banner, browser-open, exit codes) so the CLI
 * wrapper and Electron utility can each layer their own concerns on top.
 */
export async function bootServer(opts: BootServerOptions): Promise<BootedServer> {
  const skipAutoInit = opts.skipAutoInit ?? false;
  const attachUi = opts.attachUiSibling ?? true;
  const idleMsOption = opts.idleShutdownMs;
  const log = opts.log ?? getLogger('boot');

  // Lazy-import node:http and ws so this module can be `import`'d in a browser-
  // like environment for typechecking without pulling network deps at parse time.
  const { createServer: createHttpServer } = await import('node:http');
  const { WebSocketServer } = await import('ws');
  const { updateServerLockPort } = await import('./server-lock.ts');

  // Pre-createServer fail-fast hook — ensure project .git/ exists. Runs BEFORE
  // autoInitFn and BEFORE httpServer.listen() so that on failure, bootServer
  // rejects before any port is bound. No try/catch — errors propagate (D12).
  let didGitInit = false;
  if (!skipAutoInit && opts.ensureProjectGitFn) {
    const gitResult = await opts.ensureProjectGitFn();
    didGitInit = Boolean(gitResult.didInit);
  }

  // Pre-createServer scaffold hook. CLI passes initContent; desktop omits.
  let didAutoInit = false;
  if (!skipAutoInit && opts.autoInitFn) {
    try {
      const initResult = await opts.autoInitFn();
      didAutoInit = Boolean(initResult);
    } catch (err) {
      log.warn({ err }, 'autoInitFn failed');
    }
  }

  // Compose createServer options from the subset we accept.
  const serverInstance = createServer({
    contentDir: opts.contentDir,
    projectDir: opts.projectDir,
    contentRoot: opts.contentRoot,
    port: opts.port,
    host: opts.host,
    quiet: opts.quiet ?? false,
    debounce: opts.debounce,
    maxDebounce: opts.maxDebounce,
    gitEnabled: opts.gitEnabled,
    commitDebounceMs: opts.commitDebounceMs,
    wipRef: opts.wipRef,
    enableTestRoutes: opts.enableTestRoutes,
    shadowRepo: opts.shadowRepo,
    includePatterns: opts.includePatterns,
    excludePatterns: opts.excludePatterns,
    destroyTimeoutMs: opts.destroyTimeoutMs,
    localOpCliArgs: opts.localOpCliArgs,
    onAgentWrite: opts.onAgentWrite,
  });

  const { hocuspocus, destroy: destroyHocuspocus, ready, degraded, lockDir } = serverInstance;

  // HTTP server — /api/* routed through Hocuspocus onRequest extensions;
  // everything else 404s (static React assets are served separately by
  // `ok ui`, which is a CLI wrapper concern and not modeled here).
  const httpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url?.startsWith('/api/')) {
      hocuspocus
        // biome-ignore lint/suspicious/noExplicitAny: Hocuspocus `hooks()` has no exported payload type for onRequest
        .hooks('onRequest', { request: req, response: res } as any)
        .then(() => {
          if (res.writableEnded || res.headersSent) return;
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'API route not found', path: url }));
        })
        .catch((err) => {
          log.error({ err }, 'Unhandled onRequest error');
          if (!res.writableEnded && !res.headersSent) {
            res.writeHead(500);
            res.end('Internal server error');
          } else if (!res.writableEnded) {
            res.end();
          }
        });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'Not found. The React UI is served by `ok ui` (default port 3000).',
        path: url ?? '/',
      }),
    );
  });

  const wss = new WebSocketServer({ noServer: true });
  wss.on('error', (err) => {
    log.error({ err }, 'WebSocketServer error');
  });

  httpServer.on('upgrade', (req, socket, head) => {
    // D-034 — MCP keep-alive channel (see CLI start.ts for full rationale).
    if (req.url?.startsWith('/collab/keepalive')) {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (handleCollabSocketError(err)) return;
        log.error({ err }, 'MCP keepalive socket error');
      });
      wss.handleUpgrade(req, socket, head, (ws) => {
        const pingTimer = setInterval(() => {
          try {
            ws.ping();
          } catch {
            // best-effort
          }
        }, 30_000);
        pingTimer.unref?.();
        ws.on('close', () => clearInterval(pingTimer));
        ws.on('error', (err: NodeJS.ErrnoException) => {
          if (!handleCollabSocketError(err)) {
            log.error({ err }, 'MCP keepalive WS error');
          }
          ws.terminate();
        });
      });
      return;
    }

    if (req.url?.startsWith('/collab')) {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (handleCollabSocketError(err)) return;
        log.error({ err }, 'Upgrade socket error');
      });
      wss.handleUpgrade(req, socket, head, (ws) => {
        const clientConnection = hocuspocus.handleConnection(
          ws as unknown as WebSocket,
          req as unknown as Request,
        );
        ws.on('message', (data: ArrayBuffer | Buffer) => {
          clientConnection.handleMessage(
            data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data),
          );
        });
        ws.on('close', (code: number, reason: Buffer) => {
          clientConnection.handleClose({ code, reason: reason.toString() });
        });
        ws.on('error', (err: NodeJS.ErrnoException) => {
          if (!handleCollabSocketError(err)) {
            log.error({ err }, 'WebSocket error');
          }
          ws.terminate();
        });
      });
    }
  });

  // Idle-shutdown wiring — suppressed entirely when idleShutdownMs is null.
  // The CLI uses this to tear down both its own server and the `ok ui` sibling
  // after 30 min of zero WS clients; the Electron utility disables it because
  // window-close IS the shutdown trigger (D36).
  let idleHandle: IdleShutdownHandle | null = null;
  if (idleMsOption !== null) {
    const idleMs = idleMsOption ?? DEFAULT_IDLE_THRESHOLD_MS;
    const idleHandler =
      opts.idleShutdownHandler ??
      ((destroyFn) => async () => {
        await destroyFn();
      });
    idleHandle = attachIdleShutdown({
      httpServer,
      thresholdMs: idleMs,
      log,
      onShutdown: idleHandler(async () => {
        await destroyHocuspocus();
      }),
    });
  }

  // Listen — resolves only after the kernel has bound the port so callers
  // can probe `port` immediately.
  await new Promise<void>((resolveListen, reject) => {
    const onError = (err: Error) => reject(err);
    httpServer.once('error', onError);
    httpServer.listen(opts.port, opts.host, () => {
      httpServer.removeListener('error', onError);
      resolveListen();
    });
  });

  const addr = httpServer.address();
  const realPort = typeof addr === 'object' && addr !== null ? addr.port : (opts.port ?? 0);
  updateServerLockPort(lockDir, realPort);

  // UI-sibling spawn — CLI wrapper injects `spawnUiSiblingFn`; desktop leaves
  // `attachUiSibling: false` and this flow is suppressed.
  if (attachUi && opts.spawnUiSiblingFn) {
    try {
      await opts.spawnUiSiblingFn({ lockDir, log });
    } catch (err) {
      log.warn({ err }, 'spawnUiSiblingFn failed');
    }
  }

  let destroyed = false;
  const destroy = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    idleHandle?.detach();
    await new Promise<void>((resolveClose) => {
      httpServer.close(() => resolveClose());
    });
    await destroyHocuspocus();
  };

  return {
    httpServer,
    destroy,
    lockDir,
    contentDir: opts.contentDir,
    port: realPort,
    ready,
    degraded,
    didAutoInit,
    didGitInit,
    serverInstance,
  };
}
