import type { Server as HttpServer } from 'node:http';
import { toBroadcasterKey, validateAgentId } from './agent-id.ts';
import { attachIdleShutdown, type IdleShutdownHandle } from './idle-shutdown.ts';
import { getLogger, type PinoLogger } from './logger.ts';
import { handleCollabSocketError } from './metrics.ts';
import { isProcessAlive } from './process-alive.ts';
import type { EnsureProjectGitResult } from './project-git.ts';
import { createServer, type ServerInstance, type ServerOptions } from './server-factory.ts';
import { initTelemetry, shutdownTelemetry } from './telemetry.ts';

const DEFAULT_PARENT_DEATH_POLL_MS = 5_000;

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
    | 'destroyTimeoutMs'
    | 'localOpCliArgs'
    | 'onAgentWrite'
    | 'shadowRepo'
    | 'enableTestRoutes'
    | 'lockKind'
    | 'parentPid'
  > {
  skipAutoInit?: boolean;
  attachUiSibling?: boolean;
  idleShutdownMs?: number | null;
  autoInitFn?: () => boolean | Promise<boolean>;
  ensureProjectGitFn?: () => Promise<EnsureProjectGitResult>;
  spawnUiSiblingFn?: (ctx: { lockDir: string; log: PinoLogger }) => void | Promise<void>;
  idleShutdownHandler?: (destroyServer: () => Promise<void>) => () => Promise<void>;
  log?: PinoLogger;
  keepaliveGraceMs?: number;
  parentDeathPollMs?: number;
  parentAliveCheck?: (pid: number) => boolean;
  skipStateManifestCheck?: boolean;
}

export interface BootedServer {
  httpServer: HttpServer;
  destroy: () => Promise<void>;
  lockDir: string;
  contentDir: string;
  port: number;
  ready: Promise<void>;
  degraded: readonly string[];
  didAutoInit: boolean;
  didGitInit: boolean;
  serverInstance: ServerInstance;
}

export async function bootServer(opts: BootServerOptions): Promise<BootedServer> {
  const skipAutoInit = opts.skipAutoInit ?? false;
  const attachUi = opts.attachUiSibling ?? true;
  const idleMsOption = opts.idleShutdownMs;
  const log = opts.log ?? getLogger('boot');

  const envLockKind =
    process.env.OK_LOCK_KIND === 'mcp-spawned' || process.env.OK_LOCK_KIND === 'interactive'
      ? process.env.OK_LOCK_KIND
      : undefined;
  const envParentPidRaw = process.env.OK_PARENT_PID;
  const envParentPid =
    typeof envParentPidRaw === 'string' && /^[0-9]+$/.test(envParentPidRaw)
      ? Number.parseInt(envParentPidRaw, 10)
      : undefined;
  const lockKind = opts.lockKind ?? envLockKind ?? 'interactive';
  const parentPid = opts.parentPid ?? envParentPid;

  initTelemetry();

  const { createServer: createHttpServer } = await import('node:http');
  const { WebSocketServer } = await import('ws');
  const { updateServerLockPort } = await import('./server-lock.ts');

  let didGitInit = false;
  if (!skipAutoInit && opts.ensureProjectGitFn) {
    const gitResult = await opts.ensureProjectGitFn();
    didGitInit = Boolean(gitResult.didInit);
  }

  let didAutoInit = false;
  if (!skipAutoInit && opts.autoInitFn) {
    try {
      const initResult = await opts.autoInitFn();
      didAutoInit = Boolean(initResult);
    } catch (err) {
      log.warn({ err }, 'autoInitFn failed');
    }
  }

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
    destroyTimeoutMs: opts.destroyTimeoutMs,
    localOpCliArgs: opts.localOpCliArgs,
    onAgentWrite: opts.onAgentWrite,
    lockKind,
    parentPid,
    skipStateManifestCheck: opts.skipStateManifestCheck,
  });

  const {
    hocuspocus,
    destroy: destroyHocuspocus,
    ready,
    degraded,
    lockDir,
    agentPresenceBroadcaster,
  } = serverInstance;

  const httpServer = createHttpServer((req, res) => {
    const url = req.url?.split('?')[0];
    if (url?.startsWith('/api/')) {
      hocuspocus
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

  const KEEPALIVE_GRACE_MS = opts.keepaliveGraceMs ?? 10_000;
  const keepaliveGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const keepaliveGraceInflight = new Set<Promise<void>>();
  let shuttingDown = false;

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url?.startsWith('/collab/keepalive')) {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (handleCollabSocketError(err)) return;
        log.error({ err }, 'MCP keepalive socket error');
      });
      wss.handleUpgrade(req, socket, head, (ws) => {
        const connectionId = parseKeepaliveConnectionId(req.url);

        if (connectionId) {
          const existing = keepaliveGraceTimers.get(connectionId);
          if (existing !== undefined) {
            clearTimeout(existing);
            keepaliveGraceTimers.delete(connectionId);
            log.info({ connectionId }, '[keepalive] reconnect during grace — timer cancelled');
          }
        }

        const pingTimer = setInterval(() => {
          try {
            ws.ping();
          } catch {
          }
        }, 30_000);
        pingTimer.unref?.();

        const tsRefreshTimer = connectionId
          ? setInterval(() => {
              agentPresenceBroadcaster?.bumpPresenceTs(toBroadcasterKey(connectionId));
            }, 3_000)
          : null;
        tsRefreshTimer?.unref?.();

        ws.on('close', () => {
          clearInterval(pingTimer);
          if (tsRefreshTimer !== null) clearInterval(tsRefreshTimer);
          if (!connectionId) return;
          const timer = setTimeout(() => {
            keepaliveGraceTimers.delete(connectionId);
            if (shuttingDown) return;
            const work = (async () => {
              log.info({ connectionId }, '[keepalive] grace expired — cleaning up sessions');
              try {
                await serverInstance.sessionManager.closeAllForAgent(connectionId);
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] closeAllForAgent failed');
              }
              try {
                serverInstance.agentFocusBroadcaster?.clearFocus(connectionId);
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] clearFocus failed');
              }
              try {
                agentPresenceBroadcaster?.clearPresence(toBroadcasterKey(connectionId));
              } catch (err) {
                log.error({ err, connectionId }, '[keepalive] clearPresence failed');
              }
            })();
            keepaliveGraceInflight.add(work);
            work.finally(() => keepaliveGraceInflight.delete(work));
          }, KEEPALIVE_GRACE_MS);
          timer.unref?.();
          keepaliveGraceTimers.set(connectionId, timer);
          log.info(
            { connectionId, graceMs: KEEPALIVE_GRACE_MS },
            '[keepalive] disconnected — grace timer started',
          );
        });
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

  if (attachUi && opts.spawnUiSiblingFn) {
    try {
      await opts.spawnUiSiblingFn({ lockDir, log });
    } catch (err) {
      log.warn({ err }, 'spawnUiSiblingFn failed');
    }
  }

  let destroyed = false;
  let parentDeathPoll: ReturnType<typeof setInterval> | null = null;
  const destroy = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    shuttingDown = true;
    if (parentDeathPoll !== null) {
      clearInterval(parentDeathPoll);
      parentDeathPoll = null;
    }
    try {
      idleHandle?.detach();
    } catch (err) {
      log.warn({ err }, '[bootServer.destroy] idleHandle.detach failed');
    }
    for (const timer of keepaliveGraceTimers.values()) {
      clearTimeout(timer);
    }
    keepaliveGraceTimers.clear();
    if (keepaliveGraceInflight.size > 0) {
      await Promise.allSettled([...keepaliveGraceInflight]);
    }
    try {
      try {
        httpServer.closeAllConnections?.();
      } catch (err) {
        log.warn({ err }, '[bootServer.destroy] closeAllConnections failed');
      }
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          new Promise<void>((resolveClose) => httpServer.close(() => resolveClose())),
          new Promise<void>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('httpServer.close timeout after 10s')),
              10_000,
            );
          }),
        ]).catch((err) => {
          log.warn(
            { err },
            '[bootServer.destroy] httpServer.close did not complete within timeout',
          );
        });
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    } finally {
      await destroyHocuspocus();
      await shutdownTelemetry();
    }
  };

  if (parentPid !== undefined) {
    const pollMs = opts.parentDeathPollMs ?? DEFAULT_PARENT_DEATH_POLL_MS;
    const aliveCheck = opts.parentAliveCheck ?? isProcessAlive;
    parentDeathPoll = setInterval(() => {
      if (destroyed) return;
      if (aliveCheck(parentPid)) return;
      log.warn(
        { parentPid, lockKind },
        '[boot] parent process gone — initiating graceful shutdown',
      );
      void destroy().catch((err) => {
        log.error({ err, parentPid }, '[boot] parent-death shutdown failed');
      });
    }, pollMs);
    parentDeathPoll.unref?.();
  }

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

export function parseKeepaliveConnectionId(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://localhost');
    const connectionId = parsed.searchParams.get('connectionId');
    return validateAgentId(connectionId);
  } catch {
    return null;
  }
}
