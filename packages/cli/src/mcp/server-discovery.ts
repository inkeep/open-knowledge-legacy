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

/** Default deadline for the post-spawn `server.lock` poll. */
const DEFAULT_SPAWN_TIMEOUT_MS = 5000;
/** Default polling interval during the spawn deadline window. */
const DEFAULT_POLL_INTERVAL_MS = 100;
/** Tempfile name used by the kernel stderr redirect — also consumed on timeout. */
const SPAWN_ERROR_LOG = 'last-spawn-error.log';
/** Short TTL: avoids re-stat/spawn checks on bursty tool usage in one project. */
const DEFAULT_SERVER_URL_CACHE_MS = 1000;

/**
 * Read `OK_MCP_SPAWN_TIMEOUT_MS` from the environment. Returns the parsed
 * number of milliseconds, or undefined when unset / invalid. Invalid values
 * fall back to the default rather than crashing the MCP — the env knob is an
 * operator escape hatch, not a precondition.
 */
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
    };

interface DecideAutoStartInput {
  host: string;
  portOverride: string | undefined;
  envAutoStart: string | undefined;
  configAutoStart: boolean;
  readLock: () => ServerLockMetadata | null;
  isAlive: (pid: number) => boolean;
  /**
   * Protocol version this MCP child speaks. Compared against `lock.protocolVersion`
   * on the connect path; mismatch (or `undefined` lock value — pre-version-field
   * lock format) returns `action: 'incompatible'`. Defaults to the server
   * package's `PROTOCOL_VERSION` constant.
   */
  expectedProtocolVersion?: number;
}

/**
 * Pure decision function. Returns one of three verdicts:
 *
 *   - `connect` — we should reuse an existing server (either the live lock
 *     or an explicit `--port` override).
 *   - `spawn` — no live server and auto-start is allowed; detach-spawn one.
 *   - `disk-only` — no live server and auto-start is opted out; or `--port=0`.
 *
 * A live lock takes precedence over opt-out: if a user manually ran `ok start`
 * we connect regardless of `mcp.autoStart`. Opt-out only suppresses the spawn
 * path.
 */
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
    // Protocol gate (specs/2026-04-24-cross-install-version-handshake §3 G6 +
    // D14). Connect only when the lock owner speaks the same `protocolVersion`
    // we do. Pre-version-field locks (`lock.protocolVersion === undefined`)
    // count as a mismatch — we cannot safely assume contract compatibility
    // with a binary that pre-dates the lock-version scheme.
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
    const message =
      `Open Knowledge server at port ${lock.port} (pid ${lock.pid}${runtimeLabel}) ` +
      `speaks protocol ${actualLabel}; this MCP needs protocol v${expected}. ` +
      `Stop the server and retry, or align versions.`;
    return {
      action: 'incompatible',
      message,
      expectedProtocolVersion: expected,
      actualProtocolVersion: actual,
      lock,
    };
  }

  // Env wins over config (matches spec §9 code sample + FR-1.15).
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
    // Lock exists but we decided to spawn — either port=0 (foreign process
    // still booting) or dead pid (readLock already filtered out cross-host
    // and stale locks, so this is a live-but-not-usable same-host lock).
    // Surface the state for operator diagnosis.
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
  /** Structured logger for observability. */
  logger?: McpLogger;
  /** Injectable — defaults to `node:child_process#spawn`. */
  spawn?: typeof nativeSpawn;
  /** Injectable — defaults to reading `server.lock` via the server package. */
  readLock?: () => ServerLockMetadata | null;
  /** Injectable — defaults to the server-package `isProcessAlive`. */
  isAlive?: (pid: number) => boolean;
  /** Injectable — async delay used in the poll loop. Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable — defaults to reading `<lockDir>/last-spawn-error.log`. */
  readErrorLog?: (path: string) => string;
  /** Injectable — defaults to `fs.openSync(path, 'w')` (truncate on each spawn). */
  openErrorLog?: (path: string) => number;
  /** Injectable — defaults to `fs.closeSync`. */
  closeFd?: (fd: number) => void;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface EnsureServerRunningResult {
  serverUrl: string | undefined;
  message: string;
}

/**
 * Decide + (optionally) detach-spawn the server sibling, then poll
 * `server.lock` for a usable port. Returns the ws URL on success or
 * `undefined` for disk-only. Throws when spawn was attempted but the poll
 * timed out; the error message includes any captured stderr so operators can
 * diagnose without a follow-up log read.
 */
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

  const decision = decideAutoStart({
    host: opts.host,
    portOverride: opts.portOverride,
    envAutoStart: opts.envAutoStart,
    configAutoStart: opts.configAutoStart,
    readLock,
    isAlive,
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
    // MCP has no attended user and cannot prompt — exit 1 surfaces the error
    // to the editor's MCP log where the user can reconcile (specs/2026-04-24-cross-install-version-handshake
    // §3 G6 + D7). Throwing here causes ensureServerRunning's caller (the
    // MCP main entry) to exit with code 1.
    opts.logger?.error('protocol mismatch — refusing to connect', undefined, {
      expectedProtocolVersion: decision.expectedProtocolVersion,
      actualProtocolVersion: decision.actualProtocolVersion,
      lockPid: decision.lock.pid,
      lockPort: decision.lock.port,
      lockRuntimeVersion: decision.lock.runtimeVersion,
    });
    throw new Error(decision.message);
  }

  // action === 'spawn' — detach-spawn ok start as a sibling process.
  if (!existsSync(opts.lockDir)) {
    mkdirSync(opts.lockDir, { recursive: true });
  }
  const stderrPath = join(opts.lockDir, SPAWN_ERROR_LOG);
  const stderrFd = openErrorLog(stderrPath);
  let child: ChildProcess | undefined;

  // Async spawn errors (e.g. ENOENT) are reported via `error` events — which
  // Node may emit before the next microtask. Attach the listener SYNCHRONOUSLY
  // (before the finally-block and any await) so we never miss an error.
  //
  // Sync-throw path: some spawn failures (EACCES on the npx binary, PATH
  // resolution throws on certain platforms) are surfaced as synchronous
  // exceptions from `spawnFn()` itself. Catch those and convert into the same
  // `asyncSpawnError` shape so the downstream reporting is uniform regardless
  // of whether Node chose sync-throw or async-emit for this particular failure.
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
        // The spawn detaches (so process.ppid in the child becomes 1 once
        // we exit). Threading the parent pid + kind through env lets the
        // child's parent-death poll target THIS process specifically and
        // lets the desktop's attach validation refuse to bind to an
        // mcp-spawned server.
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
    } catch {
      // Best-effort — some mocks may not return a real fd.
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (asyncSpawnError) {
      const stderr = readErrorLog(stderrPath);
      opts.logger?.error('spawn failed', undefined, { error: asyncSpawnError, stderr });
      throw new Error(
        `Error: spawn failed: ${asyncSpawnError}${stderr ? ` stderr:\n${stderr}` : ''}`,
      );
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

  // Post-deadline: check one more time for an async spawn error that landed
  // between the last poll tick and the deadline — otherwise an ENOENT that
  // fires late surfaces as a generic "did not start in 5s" instead of the
  // actual cause when available.
  //
  // Read stderr AFTER the asyncSpawnError check so a late error event +
  // matching late-written stderr are both captured together.
  if (asyncSpawnError) {
    const stderr = readErrorLog(stderrPath);
    opts.logger?.error('spawn failed (post-deadline)', undefined, {
      error: asyncSpawnError,
      stderr,
    });
    throw new Error(
      `Error: spawn failed: ${asyncSpawnError}${stderr ? ` stderr:\n${stderr}` : ''}`,
    );
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
    `Error: server did not start within ${seconds}s.${livenessHint}${stderr ? ` stderr:\n${stderr}` : ''}`,
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
  /** Structured logger for observability. */
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
  ensureServerRunningFn?: EnsureServerRunningFn;
}

/**
 * Create a lazy ws-url resolver that discovers or auto-starts the Open
 * Knowledge project server for the cwd of the current tool call. The returned
 * function is safe to share across the entire MCP stdio lifetime.
 */
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
