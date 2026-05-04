import type { Server as HttpServer } from 'node:http';
import type { Config } from './config/schema.ts';
import { attachIdleShutdown, type IdleShutdownHandle } from './idle-shutdown.ts';
import { getLogger, type PinoLogger } from './logger.ts';
import { createMcpHttpHandler } from './mcp-http.ts';
import { mountMcpAndApi } from './mcp-mount.ts';
import type { EnsureProjectGitResult } from './project-git.ts';
import { createServer, type ServerInstance, type ServerOptions } from './server-factory.ts';
import { initTelemetry, shutdownTelemetry } from './telemetry.ts';

const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;
const DESTROY_STEP_TIMEOUT_MS = 5000;

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
  > {
  config: Config;
  skipAutoInit?: boolean;
  attachUiSibling?: boolean;
  idleShutdownMs?: number | null;
  autoInitFn?: () => boolean | Promise<boolean>;
  ensureProjectGitFn?: () => Promise<EnsureProjectGitResult>;
  spawnUiSiblingFn?: (ctx: { lockDir: string; log: PinoLogger }) => void | Promise<void>;
  idleShutdownHandler?: (destroyServer: () => Promise<void>) => () => Promise<void>;
  log?: PinoLogger;
  keepaliveGraceMs?: number;
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
  const lockKind = opts.lockKind ?? envLockKind ?? 'interactive';

  initTelemetry();

  const { createServer: createHttpServer } = await import('node:http');
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
    skipStateManifestCheck: opts.skipStateManifestCheck,
  });

  const {
    hocuspocus,
    destroy: destroyHocuspocus,
    ready,
    degraded,
    lockDir,
    sessionManager,
    agentFocusBroadcaster,
    agentPresenceBroadcaster,
  } = serverInstance;

  const mcpHost = (() => {
    const host = opts.host ?? 'localhost';
    if (host === '0.0.0.0' || host === '::') return 'localhost';
    return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  })();
  let boundPort = opts.port ?? 0;
  const mcpHttpHandler = createMcpHttpHandler({
    contentDir: opts.contentDir,
    projectDir: opts.projectDir ?? opts.contentDir,
    config: opts.config,
    getServerUrl: () => `http://${mcpHost}:${boundPort}`,
    log,
  });

  const httpServer = createHttpServer();

  const mount = mountMcpAndApi({
    httpServer,
    hocuspocus,
    mcpHttpHandler,
    log,
    sessionManager,
    agentFocusBroadcaster,
    agentPresenceBroadcaster,
    keepaliveGraceMs: opts.keepaliveGraceMs,
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
  boundPort = realPort;
  updateServerLockPort(lockDir, realPort);

  if (attachUi && opts.spawnUiSiblingFn) {
    try {
      await opts.spawnUiSiblingFn({ lockDir, log });
    } catch (err) {
      log.warn({ err }, 'spawnUiSiblingFn failed');
    }
  }

  let destroyed = false;
  const withDestroyTimeout = async (name: string, work: () => Promise<void>): Promise<void> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`${name} timed out after ${DESTROY_STEP_TIMEOUT_MS}ms`));
          }, DESTROY_STEP_TIMEOUT_MS);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
  const destroy = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    const errors: unknown[] = [];
    const runStep = async (name: string, work: () => Promise<void>): Promise<void> => {
      try {
        await withDestroyTimeout(name, work);
      } catch (err) {
        errors.push(err);
        log.warn({ err, step: name }, 'bootServer destroy step failed');
      }
    };

    try {
      idleHandle?.detach();
    } catch (err) {
      errors.push(err);
      log.warn({ err, step: 'idleHandle.detach' }, 'bootServer destroy step failed');
    }

    await runStep('mount.shutdown', () => mount.shutdown());
    await runStep('mcpHttpHandler.close', () => mcpHttpHandler.close());
    await runStep(
      'mount.wss.close',
      () =>
        new Promise<void>((resolveClose, rejectClose) => {
          mount.wss.close((err) => (err ? rejectClose(err) : resolveClose()));
        }),
    );
    await runStep('httpServer.closeAllConnections', async () => {
      httpServer.closeAllConnections?.();
    });
    await runStep(
      'httpServer.close',
      () =>
        new Promise<void>((resolveClose, rejectClose) => {
          httpServer.close((err) =>
            err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
              ? rejectClose(err)
              : resolveClose(),
          );
        }),
    );
    await runStep('destroyHocuspocus', () => destroyHocuspocus());
    await runStep('shutdownTelemetry', () => shutdownTelemetry());

    if (errors.length > 0) {
      throw new AggregateError(errors, 'bootServer destroy completed with errors');
    }
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
