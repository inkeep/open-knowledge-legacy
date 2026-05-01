import { type ChildProcess, spawn as nativeSpawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import {
  isProcessAlive as defaultIsProcessAlive,
  readServerLock,
  PROTOCOL_VERSION as SERVER_PROTOCOL_VERSION,
  type ServerLockMetadata,
} from '@inkeep/open-knowledge-server';
import { resolveSelfSpawn } from '../commands/self-spawn.ts';
import { resolveContentDir, resolveLockDir } from '../config/paths.ts';
import type { Config } from '../config/schema.ts';
import { normalizeCwd } from '../utils/normalize-cwd.ts';
import type { McpLogger } from './logger.ts';

export type McpLaunchShape = 'npx-cache' | 'stable-shim' | 'absolute-pin' | 'unknown';

const NPX_CACHE_MARKERS = [
  '/_npx/',
  '/.npm/_npx/',
  '/_bunx/',
  '/.bun/install/cache/',
  '/pnpm/dlx/',
];

const STABLE_SHIM_PATHS = new Set([
  '/usr/local/bin/ok',
  '/usr/local/bin/open-knowledge',
  '/opt/homebrew/bin/ok',
  '/opt/homebrew/bin/open-knowledge',
]);

export function classifyMcpLaunchPath(launchPath: string | undefined): McpLaunchShape {
  if (!launchPath || launchPath.length === 0) return 'unknown';
  for (const marker of NPX_CACHE_MARKERS) {
    if (launchPath.includes(marker)) return 'npx-cache';
  }
  if (STABLE_SHIM_PATHS.has(launchPath)) return 'stable-shim';
  if (launchPath.startsWith('/Applications/')) return 'stable-shim';
  if (launchPath.includes('.app/Contents/')) return 'stable-shim';
  if (launchPath.startsWith('/')) return 'absolute-pin';
  return 'unknown';
}

export function describeProtocolMismatchRemedy(
  shape: McpLaunchShape,
  launchPath: string | undefined,
): string {
  switch (shape) {
    case 'npx-cache':
      return (
        'This MCP was launched via a package-manager cache (npx / bunx / pnpm dlx) ' +
        'and just resolved a different package version than the running server. ' +
        'Stop `ok start` so the next launch matches, or run `ok init --pin` for a stable launch path.'
      );
    case 'stable-shim':
      return (
        'The CLI shim was likely upgraded while a project server is still running ' +
        '(a desktop auto-update or `npm i -g` / `brew upgrade` will do this). ' +
        'Close and reopen the project window, or stop `ok start`, so the next launch matches.'
      );
    case 'absolute-pin': {
      const pathSuffix = launchPath ? ` (${launchPath})` : '';
      return (
        `This MCP is launched from a pinned path${pathSuffix} that no longer matches the running server. ` +
        'Re-run `ok init --pin` from your current install to refresh, or stop `ok start` so the next launch matches.'
      );
    }
    default:
      return 'Stop `ok start` and retry, or align CLI versions across your installs.';
  }
}

export function isSpawnEnoentMessage(message: string): boolean {
  if (!message) return false;
  return /\bENOENT\b/i.test(message);
}

export function describeSpawnEnoentRemedy(launchPath: string | undefined): string {
  const shape = classifyMcpLaunchPath(launchPath);
  switch (shape) {
    case 'absolute-pin':
      return (
        'This failure usually means the CLI entry script no longer exists at the pinned path ' +
        '(common after changing how you installed Open Knowledge or removing an old global package). ' +
        'Re-run `ok init --pin` from your current install and update your editor MCP config, ' +
        'or use an unpinned launcher such as `npx @inkeep/open-knowledge mcp`.'
      );
    case 'stable-shim':
      return (
        'The expected `ok` shim is missing on disk. Reinstall or repair your Open Knowledge CLI. ' +
        'If you switched install sources, run `ok init --pin` again so your editor matches the binary you have.'
      );
    case 'npx-cache':
      return (
        'The package-manager cache copy used for this launch may have been removed. Retry once, ' +
        'or run `ok init --pin` so your editor uses a durable absolute path.'
      );
    default:
      return (
        'Often means the configured launcher path does not exist (stale pin, moved install, or missing runtime). ' +
        'Re-run `ok init --pin` from your current install or fix the MCP command in your editor settings.'
      );
  }
}

function formatSpawnFailedMessage(
  asyncSpawnError: string,
  stderr: string,
  launchPath: string | undefined,
): string {
  const stderrBlock = stderr ? ` stderr:\n${stderr}` : '';
  let out = `spawn failed: ${asyncSpawnError}${stderrBlock}`;
  if (isSpawnEnoentMessage(asyncSpawnError)) {
    out += `\n\n${describeSpawnEnoentRemedy(launchPath)}`;
  }
  return out;
}

const DEFAULT_SPAWN_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const SPAWN_ERROR_LOG = 'last-spawn-error.log';
const DEFAULT_SERVER_URL_CACHE_MS = 1000;

export function parseSpawnTimeoutEnv(raw: string | undefined): number | undefined {
  if (raw === undefined || raw === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return undefined;
  return parsed;
}

export type AutoStartDecision =
  | { action: 'connect'; url: string; message: string }
  | { action: 'spawn'; message: string }
  | { action: 'disk-only'; message: string }
  | {
      action: 'incompatible';
      message: string;
      expectedProtocolVersion: number;
      actualProtocolVersion: number | undefined;
      lock: ServerLockMetadata;
      launchShape: McpLaunchShape;
      launchPath: string | undefined;
    };

interface DecideAutoStartInput {
  host: string;
  portOverride: string | undefined;
  envAutoStart: string | undefined;
  configAutoStart: boolean;
  readLock: () => ServerLockMetadata | null;
  isAlive: (pid: number) => boolean;
  expectedProtocolVersion?: number;
  launchPath?: string;
}

export function decideAutoStart(input: DecideAutoStartInput): AutoStartDecision {
  if (input.portOverride !== undefined) {
    const parsed = Number.parseInt(input.portOverride, 10);
    if (Number.isNaN(parsed)) {
      return {
        action: 'disk-only',
        message: `invalid --port value '${input.portOverride}' — disk-only mode`,
      };
    }
    if (parsed > 0) {
      const url = `ws://${input.host}:${parsed}`;
      return { action: 'connect', url, message: `using --port override, connecting to ${url}` };
    }
    return { action: 'disk-only', message: '--port=0 — disk-only mode' };
  }

  const lock = input.readLock();
  if (lock && lock.port > 0 && input.isAlive(lock.pid)) {
    const expected = input.expectedProtocolVersion ?? SERVER_PROTOCOL_VERSION;
    const actual = lock.protocolVersion;
    if (actual === expected) {
      const url = `ws://localhost:${lock.port}`;
      return {
        action: 'connect',
        url,
        message: `connected to running instance at ${url} (pid ${lock.pid})`,
      };
    }
    const actualLabel = actual === undefined ? 'unknown (pre-version-field lock)' : `v${actual}`;
    const runtimeLabel = lock.runtimeVersion ? ` runtime ${lock.runtimeVersion}` : '';
    const launchPath = input.launchPath ?? process.argv[1];
    const launchShape = classifyMcpLaunchPath(launchPath);
    const remedy = describeProtocolMismatchRemedy(launchShape, launchPath);
    const message =
      `Open Knowledge server at port ${lock.port} (pid ${lock.pid}${runtimeLabel}) ` +
      `speaks protocol ${actualLabel}; this MCP needs protocol v${expected}.\n` +
      remedy;
    return {
      action: 'incompatible',
      message,
      expectedProtocolVersion: expected,
      actualProtocolVersion: actual,
      lock,
      launchShape,
      launchPath,
    };
  }

  if (input.envAutoStart === '0') {
    return {
      action: 'disk-only',
      message: 'auto-spawn disabled via OK_MCP_AUTOSTART=0 — disk-only mode',
    };
  }
  if (!input.configAutoStart) {
    return {
      action: 'disk-only',
      message: 'auto-spawn disabled via config.mcp.autoStart=false — disk-only mode',
    };
  }

  if (lock) {
    return {
      action: 'spawn',
      message: `existing lock is not usable (port=${lock.port}, pid=${lock.pid}) — spawning ok start`,
    };
  }
  return { action: 'spawn', message: 'no running instance — spawning ok start' };
}

interface EnsureServerRunningOptions {
  lockDir: string;
  contentDir: string;
  host: string;
  portOverride: string | undefined;
  envAutoStart: string | undefined;
  configAutoStart: boolean;
  logger?: McpLogger;
  spawn?: typeof nativeSpawn;
  readLock?: () => ServerLockMetadata | null;
  isAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  readErrorLog?: (path: string) => string;
  openErrorLog?: (path: string) => number;
  closeFd?: (fd: number) => void;
  timeoutMs?: number;
  pollIntervalMs?: number;
  launchPath?: string;
}

interface EnsureServerRunningResult {
  serverUrl: string | undefined;
  message: string;
}

export async function ensureServerRunning(
  opts: EnsureServerRunningOptions,
): Promise<EnsureServerRunningResult> {
  const readLock = opts.readLock ?? (() => readServerLock(opts.lockDir));
  const isAlive = opts.isAlive ?? defaultIsProcessAlive;
  const sleep = opts.sleep ?? ((ms: number) => wait(ms));
  const spawnFn = opts.spawn ?? nativeSpawn;
  const readErrorLog =
    opts.readErrorLog ??
    ((path: string) => (existsSync(path) ? readFileSync(path, 'utf-8').trim() : ''));
  const openErrorLog = opts.openErrorLog ?? ((path: string) => openSync(path, 'w'));
  const closeFd = opts.closeFd ?? closeSync;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const launchPathForHints = opts.launchPath ?? process.argv[1];

  const decision = decideAutoStart({
    host: opts.host,
    portOverride: opts.portOverride,
    envAutoStart: opts.envAutoStart,
    configAutoStart: opts.configAutoStart,
    readLock,
    isAlive,
    launchPath: opts.launchPath,
  });

  opts.logger?.info('auto-start decision', {
    action: decision.action,
    message: decision.message,
    contentDir: opts.contentDir,
  });

  if (decision.action === 'connect') {
    return { serverUrl: decision.url, message: decision.message };
  }
  if (decision.action === 'disk-only') {
    return { serverUrl: undefined, message: decision.message };
  }
  if (decision.action === 'incompatible') {
    opts.logger?.error('protocol mismatch — refusing to connect', undefined, {
      expectedProtocolVersion: decision.expectedProtocolVersion,
      actualProtocolVersion: decision.actualProtocolVersion,
      lockPid: decision.lock.pid,
      lockPort: decision.lock.port,
      lockRuntimeVersion: decision.lock.runtimeVersion,
      launchShape: decision.launchShape,
      launchPath: decision.launchPath,
    });
    throw new Error(decision.message);
  }

  if (!existsSync(opts.lockDir)) {
    mkdirSync(opts.lockDir, { recursive: true });
  }
  const stderrPath = join(opts.lockDir, SPAWN_ERROR_LOG);
  const stderrFd = openErrorLog(stderrPath);
  let child: ChildProcess | undefined;

  let asyncSpawnError: string | undefined;
  const self = resolveSelfSpawn();
  opts.logger?.info('spawning server', {
    command: self.command,
    cwd: opts.contentDir,
    timeoutMs,
  });
  try {
    try {
      child = spawnFn(self.command, [...self.prefixArgs, 'start'], {
        detached: true,
        stdio: ['ignore', 'ignore', stderrFd],
        cwd: opts.contentDir,
        env: {
          ...process.env,
          OK_LOCK_KIND: 'mcp-spawned',
          OK_PARENT_PID: String(process.pid),
        },
      });
      child.on('error', (err) => {
        asyncSpawnError = err instanceof Error ? err.message : String(err);
      });
      child.unref();
    } catch (err) {
      asyncSpawnError = err instanceof Error ? err.message : String(err);
    }
  } finally {
    try {
      closeFd(stderrFd);
    } catch {}
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (asyncSpawnError) {
      const stderr = readErrorLog(stderrPath);
      opts.logger?.error('spawn failed', undefined, {
        error: asyncSpawnError,
        stderr,
        launchPath: launchPathForHints,
        stalePinHint: isSpawnEnoentMessage(asyncSpawnError),
      });
      throw new Error(formatSpawnFailedMessage(asyncSpawnError, stderr, launchPathForHints));
    }
    await sleep(pollIntervalMs);
    const lock = readLock();
    if (lock && lock.port > 0 && isAlive(lock.pid)) {
      const url = `ws://localhost:${lock.port}`;
      opts.logger?.info('server ready after spawn', { url, pid: lock.pid });
      return {
        serverUrl: url,
        message: `spawned ok start; connected at ${url} (pid ${lock.pid})`,
      };
    }
  }

  if (asyncSpawnError) {
    const stderr = readErrorLog(stderrPath);
    opts.logger?.error('spawn failed (post-deadline)', undefined, {
      error: asyncSpawnError,
      stderr,
      launchPath: launchPathForHints,
      stalePinHint: isSpawnEnoentMessage(asyncSpawnError),
    });
    throw new Error(formatSpawnFailedMessage(asyncSpawnError, stderr, launchPathForHints));
  }
  const stderr = readErrorLog(stderrPath);
  const seconds = (timeoutMs / 1000).toFixed(timeoutMs % 1000 === 0 ? 0 : 2);
  const childPid = child?.pid;
  let livenessHint = '';
  if (typeof childPid === 'number') {
    livenessHint = isAlive(childPid)
      ? ` child pid=${childPid} is still running — raise OK_MCP_SPAWN_TIMEOUT_MS if this is a slow boot.`
      : ` child pid=${childPid} exited — check last-spawn-error.log.`;
  }
  opts.logger?.error('spawn poll timeout', undefined, {
    timeoutMs,
    childPid,
    childAlive: typeof childPid === 'number' ? isAlive(childPid) : undefined,
    stderr: stderr || undefined,
  });
  throw new Error(
    `server did not start within ${seconds}s.${livenessHint}${stderr ? ` stderr:\n${stderr}` : ''}`,
  );
}

type EnsureServerRunningFn = (
  opts: EnsureServerRunningOptions,
) => Promise<EnsureServerRunningResult>;

interface CreateProjectServerUrlResolverOptions {
  startupCwd: string;
  resolveConfig: (cwd?: string) => Promise<Config>;
  host: string;
  portOverride: string | undefined;
  envAutoStart: string | undefined;
  logger?: McpLogger;
  timeoutMs?: number;
  pollIntervalMs?: number;
  cacheMs?: number;
  spawn?: typeof nativeSpawn;
  readLock?: (lockDir: string) => ServerLockMetadata | null;
  isAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  readErrorLog?: (path: string) => string;
  openErrorLog?: (path: string) => number;
  closeFd?: (fd: number) => void;
  launchPath?: string;
  ensureServerRunningFn?: EnsureServerRunningFn;
}

export function createProjectServerUrlResolver(
  opts: CreateProjectServerUrlResolverOptions,
): (cwd?: string) => Promise<string | undefined> {
  if (opts.portOverride !== undefined) {
    const parsed = Number.parseInt(opts.portOverride, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      return async () => undefined;
    }
    const url = `ws://${opts.host}:${parsed}`;
    return async () => url;
  }

  const ensure = opts.ensureServerRunningFn ?? ensureServerRunning;
  const cacheMs = opts.cacheMs ?? DEFAULT_SERVER_URL_CACHE_MS;
  const cache = new Map<string, { url: string | undefined; expiresAt: number }>();
  const pendingResolutions = new Map<string, Promise<string | undefined>>();

  return async (cwd?: string): Promise<string | undefined> => {
    const effectiveCwd = await normalizeCwd(cwd ?? opts.startupCwd);
    const now = Date.now();
    const cached = cache.get(effectiveCwd);
    if (cached && cached.expiresAt > now) {
      opts.logger?.debug('server url cache hit', { cwd: effectiveCwd, url: cached.url });
      return cached.url;
    }

    const pending = pendingResolutions.get(effectiveCwd);
    if (pending) {
      opts.logger?.debug('server url resolution pending', { cwd: effectiveCwd });
      return await pending;
    }

    opts.logger?.debug('server url cache miss', { cwd: effectiveCwd });
    const resolution = (async (): Promise<string | undefined> => {
      const config = await opts.resolveConfig(effectiveCwd);
      const contentDir = resolveContentDir(config, effectiveCwd);
      const lockDir = resolveLockDir(contentDir);
      const readLockForDir = opts.readLock;
      const readLock = readLockForDir ? () => readLockForDir(lockDir) : undefined;
      const result = await ensure({
        lockDir,
        contentDir,
        host: config.server.host,
        portOverride: undefined,
        envAutoStart: opts.envAutoStart,
        configAutoStart: config.mcp.autoStart,
        logger: opts.logger,
        timeoutMs: opts.timeoutMs,
        pollIntervalMs: opts.pollIntervalMs,
        spawn: opts.spawn,
        readLock,
        isAlive: opts.isAlive,
        sleep: opts.sleep,
        readErrorLog: opts.readErrorLog,
        openErrorLog: opts.openErrorLog,
        closeFd: opts.closeFd,
        launchPath: opts.launchPath,
      });
      cache.set(effectiveCwd, { url: result.serverUrl, expiresAt: Date.now() + cacheMs });
      return result.serverUrl;
    })();

    pendingResolutions.set(effectiveCwd, resolution);
    try {
      return await resolution;
    } finally {
      pendingResolutions.delete(effectiveCwd);
    }
  };
}
