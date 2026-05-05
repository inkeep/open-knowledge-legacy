import {
  type ChildProcess,
  type spawn as NativeSpawn,
  spawn as nativeSpawn,
} from 'node:child_process';
import { closeSync, existsSync as fsExistsSync, mkdirSync as fsMkdirSync, openSync } from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import {
  type BootedServer,
  type Config,
  getLocalDir,
  type PinoLogger,
} from '@inkeep/open-knowledge-server';
import { Command, InvalidArgumentError } from 'commander';
import { OK_DIR, PACKAGE_VERSION } from '../constants.ts';
import {
  createRealDetectDeps,
  detectDesktop,
  launchDesktop,
  notFoundMessage,
} from './desktop-dispatch.ts';
import { resolveSelfSpawn } from './self-spawn.ts';

const DEFAULT_IDLE_THRESHOLD_MS = 30 * 60 * 1000;

export type UiSpawnDecision =
  | { action: 'spawn'; reason: 'absent' }
  | { action: 'spawn'; reason: 'stale'; stalePid: number }
  | { action: 'skip'; reason: 'alive'; pid: number; port: number };

interface DecideUiSpawnInput {
  uiLock: { pid: number; port: number } | null;
  isAlive: (pid: number) => boolean;
}

export function decideUiSpawn(input: DecideUiSpawnInput): UiSpawnDecision {
  if (!input.uiLock) return { action: 'spawn', reason: 'absent' };
  if (!input.isAlive(input.uiLock.pid)) {
    return { action: 'spawn', reason: 'stale', stalePid: input.uiLock.pid };
  }
  return { action: 'skip', reason: 'alive', pid: input.uiLock.pid, port: input.uiLock.port };
}

interface SpawnOkUiOptions {
  lockDir: string;
  cwd: string;
  spawn?: typeof NativeSpawn;
  args?: string[];
}

export function spawnOkUi(opts: SpawnOkUiOptions): ChildProcess {
  if (!fsExistsSync(opts.lockDir)) fsMkdirSync(opts.lockDir, { recursive: true });
  const stderrPath = join(opts.lockDir, 'last-spawn-error.log');
  const stderrFd = openSync(stderrPath, 'w');
  const spawnFn = opts.spawn ?? nativeSpawn;
  const { PORT: _strippedPort, ...childEnv } = process.env;
  const self = resolveSelfSpawn();
  try {
    const child = spawnFn(self.command, [...self.prefixArgs, ...(opts.args ?? ['ui'])], {
      detached: true,
      stdio: ['ignore', 'ignore', stderrFd],
      cwd: opts.cwd,
      env: childEnv,
    });
    child.unref();
    return child;
  } finally {
    try {
      closeSync(stderrFd);
    } catch {}
  }
}

interface AwaitUiSiblingPortInput {
  readUiLock: () => { port: number } | null;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  timeoutMs: number;
  pollIntervalMs: number;
}

export async function awaitUiSiblingPort(deps: AwaitUiSiblingPortInput): Promise<number | null> {
  const deadline = deps.now() + deps.timeoutMs;
  while (deps.now() < deadline) {
    const lock = deps.readUiLock();
    if (lock && lock.port > 0) return lock.port;
    await deps.sleep(deps.pollIntervalMs);
  }
  const lock = deps.readUiLock();
  if (lock && lock.port > 0) return lock.port;
  return null;
}

interface BuildIdleShutdownHandlerInput {
  readUiLock: () => { pid: number; port: number } | null;
  isAlive: (pid: number) => boolean;
  killPid: (pid: number, signal: NodeJS.Signals) => void;
  destroy: () => Promise<void>;
  sigtermPollIntervalMs?: number;
  sigtermGraceMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: {
    info: (obj: object, msg: string) => void;
    warn: (obj: object, msg: string) => void;
    error: (obj: object, msg: string) => void;
  };
}

const DEFAULT_SIGTERM_GRACE_MS = 10_000;
const DEFAULT_SIGTERM_POLL_MS = 200;

export function buildIdleShutdownHandler(
  input: BuildIdleShutdownHandlerInput,
): () => Promise<void> {
  const graceMs = input.sigtermGraceMs ?? DEFAULT_SIGTERM_GRACE_MS;
  const pollMs = input.sigtermPollIntervalMs ?? DEFAULT_SIGTERM_POLL_MS;
  const sleep = input.sleep ?? ((ms: number) => wait(ms));

  return async () => {
    try {
      const lock = input.readUiLock();
      if (lock && input.isAlive(lock.pid)) {
        try {
          input.killPid(lock.pid, 'SIGTERM');
          input.log?.info({ pid: lock.pid, port: lock.port }, 'idle-shutdown: SIGTERM UI sibling');
          const deadline = Date.now() + graceMs;
          while (Date.now() < deadline) {
            if (!input.isAlive(lock.pid)) break;
            await sleep(pollMs);
          }
          if (input.isAlive(lock.pid)) {
            try {
              input.killPid(lock.pid, 'SIGKILL');
              input.log?.warn(
                { pid: lock.pid, graceMs },
                'idle-shutdown: SIGTERM grace expired — escalated to SIGKILL',
              );
            } catch (err) {
              input.log?.error(
                { pid: lock.pid, err: err instanceof Error ? err.message : String(err) },
                'idle-shutdown: SIGKILL failed',
              );
            }
          }
        } catch (err) {
          input.log?.warn(
            { pid: lock.pid, err: err instanceof Error ? err.message : String(err) },
            'idle-shutdown: failed to SIGTERM UI sibling',
          );
        }
      }
    } catch (err) {
      input.log?.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'idle-shutdown: UI lookup failed; proceeding with destroy',
      );
    }
    await input.destroy();
  };
}

interface BootStartServerOptions {
  config: Config;
  cwd: string;
  port?: number;
  skipAutoInit?: boolean;
  skipUiAutoSpawn?: boolean;
  spawn?: typeof NativeSpawn;
  idleThresholdMs?: number;
  uiBindTimeoutMs?: number;
  log?: PinoLogger;
}

export interface BootedStartServer {
  httpServer: HttpServer;
  destroy: () => Promise<void>;
  lockDir: string;
  contentDir: string;
  port: number;
  ready: Promise<void>;
  degraded: readonly string[];
  uiSpawnDecision: UiSpawnDecision;
  resolvedUiPort: number | null;
  didAutoInit: boolean;
}

export async function bootStartServer(opts: BootStartServerOptions): Promise<BootedStartServer> {
  const { config, cwd } = opts;
  const skipAutoInit = opts.skipAutoInit ?? false;
  const skipUiAutoSpawn = opts.skipUiAutoSpawn ?? false;
  const idleThresholdMs = opts.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;

  const { existsSync, mkdirSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  const { bootServer, getLogger, isProcessAlive, readUiLock, resolveContentDir } = await import(
    '@inkeep/open-knowledge-server'
  );

  const log = opts.log ?? getLogger('start');

  const contentDir = resolveContentDir(config, cwd);
  if (!existsSync(contentDir)) {
    mkdirSync(contentDir, { recursive: true });
    log.info({ contentDir }, 'Created content directory');
  }

  const okDir = resolve(cwd, OK_DIR);
  const needsScaffold = !existsSync(okDir);
  const autoInitFn = skipAutoInit
    ? undefined
    : async () => {
        try {
          const { initContent } = await import('../content/init.ts');
          const result = initContent(cwd);
          return needsScaffold || result.created.length > 0 || result.updated.length > 0;
        } catch (err) {
          console.warn('Auto-init failed:', err instanceof Error ? err.message : err);
          return false;
        }
      };

  let agentEditOpened = false;
  const lockDirForUiLookup = getLocalDir(contentDir);
  const onAgentWrite = config.server.openOnAgentEdit
    ? () => {
        if (agentEditOpened) return;
        const ui = readUiLock(lockDirForUiLookup);
        if (!ui || ui.port <= 0 || !isProcessAlive(ui.pid)) return;
        agentEditOpened = true;
        const uiUrl = `http://localhost:${ui.port}`;
        import('../utils/open-browser.ts')
          .then(({ openBrowser }) => openBrowser(uiUrl))
          .catch(() => {});
      }
    : undefined;

  let uiSpawnDecision: UiSpawnDecision | null = null;
  const spawnUiSiblingFn = async ({
    lockDir: resolvedLockDir,
  }: {
    lockDir: string;
    log: PinoLogger;
  }) => {
    const uiLockBefore = readUiLock(resolvedLockDir);
    uiSpawnDecision = decideUiSpawn({
      uiLock: uiLockBefore,
      isAlive: isProcessAlive,
    });
    if (uiSpawnDecision.action === 'spawn' && !skipUiAutoSpawn) {
      try {
        spawnOkUi({ lockDir: resolvedLockDir, cwd, spawn: opts.spawn });
        log.info({ reason: uiSpawnDecision.reason }, '[start] auto-spawned ok ui sibling');
      } catch (err) {
        console.warn(
          `[start] failed to auto-spawn ok ui: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else if (uiSpawnDecision.action === 'skip') {
      log.info(
        { port: uiSpawnDecision.port, pid: uiSpawnDecision.pid },
        `UI already running at port ${uiSpawnDecision.port}`,
      );
    }
  };

  const booted: BootedServer = await bootServer({
    config,
    contentDir,
    projectDir: cwd,
    contentRoot: config.content.dir,
    port: opts.port,
    host: config.server.host,
    quiet: false,
    onAgentWrite,
    localOpCliArgs: [process.execPath, process.argv[1]],
    attachUiSibling: true,
    idleShutdownMs: idleThresholdMs,
    skipAutoInit,
    autoInitFn,
    spawnUiSiblingFn,
    idleShutdownHandler: (destroyServer) =>
      buildIdleShutdownHandler({
        readUiLock: () => readUiLock(booted.lockDir),
        isAlive: isProcessAlive,
        killPid: (pid, signal) => {
          process.kill(pid, signal);
        },
        destroy: destroyServer,
        log,
      }),
    log,
  });

  if (!uiSpawnDecision) {
    uiSpawnDecision = { action: 'skip', reason: 'alive', pid: 0, port: 0 };
  }

  const decisionAtBoot: UiSpawnDecision = uiSpawnDecision;
  let resolvedUiPort: number | null = null;
  if (decisionAtBoot.action === 'skip') {
    resolvedUiPort = decisionAtBoot.port > 0 ? decisionAtBoot.port : null;
  } else if (!skipUiAutoSpawn) {
    const uiBindTimeoutMs = opts.uiBindTimeoutMs ?? 3000;
    resolvedUiPort = await awaitUiSiblingPort({
      readUiLock: () => readUiLock(booted.lockDir),
      now: Date.now,
      sleep: (ms) => wait(ms),
      timeoutMs: uiBindTimeoutMs,
      pollIntervalMs: 50,
    });
    if (resolvedUiPort === null) {
      log.warn(
        { timeoutMs: uiBindTimeoutMs },
        '[start] ok ui did not bind within timeout — banner falls back to API URL',
      );
    }
  }

  return {
    httpServer: booted.httpServer,
    destroy: booted.destroy,
    lockDir: booted.lockDir,
    contentDir,
    port: booted.port,
    ready: booted.ready,
    degraded: booted.degraded,
    uiSpawnDecision,
    resolvedUiPort,
    didAutoInit: booted.didAutoInit,
  };
}

type StartMode = 'browser' | 'app';

interface StartCommandOptions {
  port?: string | number;
  host?: string;
  open?: boolean;
  init?: boolean;
  mode?: StartMode;
}

function parseStartMode(value: string): StartMode {
  if (value === 'browser' || value === 'app') return value;
  throw new InvalidArgumentError("--mode must be 'browser' or 'app'");
}

export async function runStartCommand(config: Config, opts: StartCommandOptions): Promise<void> {
  const { renderBanner } = await import('../ui/banner.ts');
  const { dim, error, info, warning } = await import('../ui/colors.ts');

  const cwd = process.cwd();

  if (opts.host !== undefined) config.server.host = opts.host;

  const portFromCli = opts.port !== undefined ? Number(opts.port) : undefined;
  const portFromEnv = process.env.PORT ? Number(process.env.PORT) : undefined;
  const port = portFromCli ?? portFromEnv;

  let booted: BootedStartServer;
  try {
    booted = await bootStartServer({
      config,
      cwd,
      port,
      skipAutoInit: opts.init === false,
    });
  } catch (err) {
    const serverModule = await import('@inkeep/open-knowledge-server');
    const tailored = tryDescribeLockCollision(err, cwd, serverModule);
    if (tailored !== null) {
      console.error(error(tailored));
      process.exit(1);
    }

    console.error(
      `${error('Failed to start:')} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
    );
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(dim(`\nShutting down (${signal})...`));
    try {
      await booted.destroy();
    } catch (err) {
      console.error(
        `${error('destroy() failed:')} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
      process.exitCode = 1;
    }
    process.exit(process.exitCode ?? 0);
  };
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  const apiUrl = `http://${config.server.host}:${booted.port}`;
  const networkUrl =
    config.server.host === '0.0.0.0' || config.server.host === '::'
      ? `http://0.0.0.0:${booted.port}`
      : undefined;

  const uiPort = booted.resolvedUiPort;
  const localUrl =
    uiPort !== null && uiPort > 0 ? `http://${config.server.host}:${uiPort}` : apiUrl;

  console.log(
    renderBanner({
      name: 'open-knowledge',
      version: PACKAGE_VERSION,
      localUrl,
      apiUrl: localUrl !== apiUrl ? apiUrl : undefined,
      networkUrl,
    }),
  );
  if (booted.didAutoInit) {
    console.log(`  ${info('\u2713')} Scaffolded ${OK_DIR}/ (first run)`);
    console.log(
      `  ${dim('Tip: Run `open-knowledge init` to register MCP tools for Claude Code')}\n`,
    );
  }

  const DEGRADED_IMPACTS: Record<string, string> = {
    'shadow-repo': 'Version history and branch-switch safety unavailable',
    'file-watcher': 'External file changes will not sync to the editor',
    'head-watcher': 'Git branch switches may cause document inconsistency',
  };
  booted.ready
    .then(async () => {
      if (booted.degraded.length > 0) {
        console.log();
        for (const id of booted.degraded) {
          const impact = DEGRADED_IMPACTS[id] ?? `${id} (check server logs for details)`;
          console.warn(`  ${warning('\u26a0')} ${warning(id)}: ${dim(impact)}`);
        }
        console.log();
      }

      if (booted.didAutoInit) {
        try {
          const { previewContent, formatPreviewBlock } = await import('../content/preview.ts');
          const preview = previewContent({
            projectDir: cwd,
            contentDir: booted.contentDir,
          });
          console.log(`\n${formatPreviewBlock(preview, cwd)}\n`);
        } catch (e) {
          console.warn(
            `Content preview unavailable: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      if (opts.open) {
        const { openBrowser } = await import('../utils/open-browser.ts');
        openBrowser(localUrl);
      }
    })
    .catch((err) => {
      console.error(
        `  ${error('Server initialization failed:')} ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

export function tryDescribeLockCollision(
  err: unknown,
  cwd: string,
  serverModule: typeof import('@inkeep/open-knowledge-server'),
): string | null {
  const lockErr = serverModule.ServerLockCollisionError;
  if (lockErr === undefined || !(err instanceof lockErr)) return null;

  try {
    const lockDir = join(cwd, OK_DIR);
    const meta = serverModule.readServerLock(lockDir);
    if (!meta) {
      return 'Open Knowledge server is already running on this project — check `ok status` or `ok stop`.';
    }
    if (meta.kind === 'interactive') {
      return 'Open Knowledge desktop is currently running on this project. Quit it or use --cwd to point elsewhere.';
    }
    if (meta.kind === 'mcp-spawned') {
      return 'An MCP-spawned server holds this lock; it should release on idle-shutdown (~30 min). Or run `ok stop`.';
    }
    return 'Open Knowledge server is already running on this project — check `ok status` or `ok stop`.';
  } catch {
    return null;
  }
}

export function startCommand(getConfig: () => Config): Command {
  const cmd = new Command('start')
    .description('Start the knowledge base collab server')
    .option('-p, --port <port>', 'Server port', undefined)
    .option('-H, --host <host>', 'Server host', undefined)
    .option('--open', 'Open browser after start')
    .option('--no-init', `Skip auto-scaffolding of ${OK_DIR}/`)
    .option('--mode <mode>', "Force dispatch mode: 'browser' or 'app'", parseStartMode)
    .action(async (opts: StartCommandOptions) => {
      const config = getConfig();

      if (opts.mode === 'app') {
        if (opts.open) {
          process.stderr.write(
            "error: option '--mode=app' cannot be combined with '--open' (--open opens a browser tab against the local server, which app mode does not boot)\n",
          );
          process.exit(2);
        }

        const ignored: string[] = [];
        if (opts.port !== undefined) ignored.push('--port');
        if (opts.host !== undefined) ignored.push('--host');
        if (opts.init === false) ignored.push('--no-init');
        if (ignored.length > 0) {
          const logLevel = process.env.OK_LOG_LEVEL ?? 'info';
          if (logLevel === 'debug' || logLevel === 'trace') {
            console.error(`--mode=app: ignoring ${ignored.join(', ')}`);
          }
        }

        const decision = detectDesktop(createRealDetectDeps());

        if (decision.available) {
          launchDesktop({ spawn: nativeSpawn });
          return;
        }

        console.error(notFoundMessage(decision.reason));
        process.exit(1);
      }

      await runStartCommand(config, opts);
    });

  return cmd;
}
