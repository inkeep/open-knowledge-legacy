import { existsSync, readdirSync, statSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import { resolve } from 'node:path';
import {
  ASSET_EXTENSIONS,
  EXECUTABLE_BLOCKLIST_EXTENSIONS,
  INLINE_RENDERABLE_EXTENSIONS,
  LOCAL_DIR,
  OK_DIR,
} from '@inkeep/open-knowledge-core';
import { resolveGitDirDetailed } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import sirv from 'sirv';
import { createAssetServeMiddleware } from './asset-serve-middleware.ts';
import type { Config } from './config/schema.ts';
import { normalizeFsPath } from './fs-traced.ts';
import { attachIdleShutdown, type IdleShutdownHandle } from './idle-shutdown.ts';
import { getLogger, type PinoLogger } from './logger.ts';
import { createMcpHttpHandler } from './mcp-http.ts';
import { mountMcpAndApi } from './mcp-mount.ts';
import { MissingOkConfigError } from './missing-ok-config-error.ts';
import { createServer, type ServerInstance, type ServerOptions } from './server-factory.ts';
import { initTelemetry, shutdownTelemetry, withSpan } from './telemetry.ts';

const LEGACY_RUNTIME_FILENAMES = [
  'server.lock',
  'ui.lock',
  'state.json',
  'principal.json',
  'sync-state.json',
  'conflicts.json',
  'last-spawn-error.log',
] as const;

const LEGACY_RUNTIME_DIRNAMES = ['cache', 'tmp'] as const;

export function findLegacyRuntimeFiles(okDir: string): string[] {
  const localDir = resolve(okDir, LOCAL_DIR);
  const localDirEmpty = (() => {
    if (!existsSync(localDir)) return true;
    try {
      return readdirSync(localDir).length === 0;
    } catch {
      return true;
    }
  })();
  if (!localDirEmpty) return [];

  const found: string[] = [];
  for (const name of LEGACY_RUNTIME_FILENAMES) {
    if (existsSync(resolve(okDir, name))) found.push(name);
  }
  for (const name of LEGACY_RUNTIME_DIRNAMES) {
    const candidate = resolve(okDir, name);
    try {
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        found.push(`${name}/`);
      }
    } catch {}
  }
  return found;
}

function computeWorktreeAttributes(projectDir: string): {
  kind: 'main' | 'linked';
  gitdir: string | null;
} {
  const result = resolveGitDirDetailed(projectDir);
  switch (result.kind) {
    case 'directory':
      return { kind: 'main', gitdir: result.path };
    case 'linked':
      return { kind: 'linked', gitdir: result.path };
    case 'malformed-pointer':
      return { kind: 'linked', gitdir: null };
    case 'inaccessible':
    case 'absent':
      return { kind: 'main', gitdir: null };
  }
}

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
  serveContentAssets?: boolean;
  autoInitFn?: () => boolean | Promise<boolean>;
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
  serverInstance: ServerInstance;
}

export async function bootServer(opts: BootServerOptions): Promise<BootedServer> {
  initTelemetry();

  const { kind: worktreeKind, gitdir: worktreeGitdir } = computeWorktreeAttributes(
    opts.projectDir ?? opts.contentDir,
  );
  const spanAttributes: Record<string, string> = { 'ok.worktree.kind': worktreeKind };
  if (worktreeGitdir !== null) {
    spanAttributes['ok.worktree.gitdir'] = normalizeFsPath(worktreeGitdir);
  }

  return withSpan('ok.boot', { attributes: spanAttributes }, async () => bootServerInner(opts));
}

async function bootServerInner(opts: BootServerOptions): Promise<BootedServer> {
  const skipAutoInit = opts.skipAutoInit ?? false;
  const attachUi = opts.attachUiSibling ?? true;
  const idleMsOption = opts.idleShutdownMs;
  const log = opts.log ?? getLogger('boot');

  const envLockKind =
    process.env.OK_LOCK_KIND === 'mcp-spawned' || process.env.OK_LOCK_KIND === 'interactive'
      ? process.env.OK_LOCK_KIND
      : undefined;
  const lockKind = opts.lockKind ?? envLockKind ?? 'interactive';

  const { createServer: createHttpServer } = await import('node:http');
  const { updateServerLockPort } = await import('./server-lock.ts');

  let didAutoInit = false;
  if (!skipAutoInit && opts.autoInitFn) {
    try {
      const initResult = await opts.autoInitFn();
      didAutoInit = Boolean(initResult);
    } catch (err) {
      log.warn({ err }, 'autoInitFn failed');
    }
  }

  const projectDir = opts.projectDir ?? opts.contentDir;
  const okDir = resolve(projectDir, OK_DIR);
  const configPath = resolve(okDir, 'config.yml');
  if (!existsSync(configPath)) {
    const okDirExists = existsSync(okDir);
    throw new MissingOkConfigError(okDirExists ? 'config' : 'okdir', projectDir);
  }
  const gitignorePath = resolve(okDir, '.gitignore');
  if (!existsSync(gitignorePath)) {
    console.warn(
      `[boot] Note: ${OK_DIR}/.gitignore is missing — per-machine state files in ${OK_DIR}/ may show up as untracked changes. Run \`ok init\` to add the recommended ignore entries.`,
    );
  }

  const legacyFound = findLegacyRuntimeFiles(okDir);
  if (legacyFound.length > 0) {
    console.warn(
      `[boot] Found legacy runtime files at ${OK_DIR}/${legacyFound.join(', ')}. Delete ${OK_DIR}/ and re-init — these files moved to ${OK_DIR}/${LOCAL_DIR}/.`,
    );
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
  httpServer.headersTimeout = 30_000;
  httpServer.requestTimeout = 60_000;

  const contentAssetMiddleware = opts.serveContentAssets
    ? createAssetServeMiddleware({
        contentFilter: serverInstance.contentFilter,
        contentSirv: sirv(opts.contentDir, { dev: true, dotfiles: false }),
        inlineExtensions: INLINE_RENDERABLE_EXTENSIONS,
        assetExtensions: ASSET_EXTENSIONS,
        blocklistExtensions: EXECUTABLE_BLOCKLIST_EXTENSIONS,
      })
    : undefined;

  const mount = mountMcpAndApi({
    httpServer,
    hocuspocus,
    mcpHttpHandler,
    log,
    sessionManager,
    agentFocusBroadcaster,
    agentPresenceBroadcaster,
    keepaliveGraceMs: opts.keepaliveGraceMs,
    contentAssetMiddleware,
  });

  let destroy: () => Promise<void> = async () => {
    throw new Error('bootServer: destroy() invoked before initialization — boot did not complete');
  };

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
        await destroy();
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
  destroy = async (): Promise<void> => {
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
    serverInstance,
  };
}
