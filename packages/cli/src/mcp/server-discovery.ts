import { type ChildProcess, spawn as nativeSpawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isProcessAlive as defaultIsProcessAlive,
  readServerLock,
  type ServerLockMetadata,
} from '@inkeep/open-knowledge-server';
import { resolveSelfSpawn } from '../commands/self-spawn.ts';
import { resolveContentDir, resolveLockDir } from '../config/paths.ts';
import type { Config } from '../config/schema.ts';
import { normalizeCwd } from '../utils/normalize-cwd.ts';

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
  | { action: 'disk-only'; message: string };

export interface DecideAutoStartInput {
  host: string;
  portOverride: string | undefined;
  envAutoStart: string | undefined;
  configAutoStart: boolean;
  readLock: () => ServerLockMetadata | null;
  isAlive: (pid: number) => boolean;
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
    const url = `ws://localhost:${lock.port}`;
    return {
      action: 'connect',
      url,
      message: `connected to running instance at ${url} (pid ${lock.pid})`,
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

export interface EnsureServerRunningOptions {
  lockDir: string;
  contentDir: string;
  host: string;
  portOverride: string | undefined;
  envAutoStart: string | undefined;
  configAutoStart: boolean;
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

export interface EnsureServerRunningResult {
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
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((res) => setTimeout(res, ms)));
  const spawnFn = opts.spawn ?? nativeSpawn;
  const readErrorLog =
    opts.readErrorLog ??
    ((path: string) => (existsSync(path) ? readFileSync(path, 'utf-8').trim() : ''));
  const openErrorLog = opts.openErrorLog ?? ((path: string) => openSync(path, 'w'));
  const closeFd = opts.closeFd ?? ((fd: number) => closeSync(fd));
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

  if (decision.action === 'connect') {
    return { serverUrl: decision.url, message: decision.message };
  }
  if (decision.action === 'disk-only') {
    return { serverUrl: undefined, message: decision.message };
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
  try {
    try {
      child = spawnFn(self.command, [...self.prefixArgs, 'start'], {
        detached: true,
        stdio: ['ignore', 'ignore', stderrFd],
        cwd: opts.contentDir,
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
      throw new Error(`OK: spawn failed: ${asyncSpawnError}${stderr ? ` stderr:\n${stderr}` : ''}`);
    }
    await sleep(pollIntervalMs);
    const lock = readLock();
    if (lock && lock.port > 0 && isAlive(lock.pid)) {
      const url = `ws://localhost:${lock.port}`;
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
    throw new Error(`OK: spawn failed: ${asyncSpawnError}${stderr ? ` stderr:\n${stderr}` : ''}`);
  }
  const stderr = readErrorLog(stderrPath);
  const seconds = (timeoutMs / 1000).toFixed(timeoutMs % 1000 === 0 ? 0 : 2);
  // Distinguish slow-start from crashed-start: if the child pid is still
  // alive, the server is slow (big machine, cold cache, contended IO) —
  // operators can raise `OK_MCP_SPAWN_TIMEOUT_MS`. If the child is gone,
  // something crashed before the poll could catch it — they want stderr.
  const childPid = child?.pid;
  let livenessHint = '';
  if (typeof childPid === 'number') {
    livenessHint = isAlive(childPid)
      ? ` child pid=${childPid} is still running — raise OK_MCP_SPAWN_TIMEOUT_MS if this is a slow boot.`
      : ` child pid=${childPid} exited — check last-spawn-error.log.`;
  }
  throw new Error(
    `OK: server did not start within ${seconds}s.${livenessHint}${stderr ? ` stderr:\n${stderr}` : ''}`,
  );
}

type EnsureServerRunningFn = (
  opts: EnsureServerRunningOptions,
) => Promise<EnsureServerRunningResult>;

export interface CreateProjectServerUrlResolverOptions {
  startupCwd: string;
  resolveConfig: (cwd?: string) => Promise<Config>;
  host: string;
  portOverride: string | undefined;
  envAutoStart: string | undefined;
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

  return async (cwd?: string): Promise<string | undefined> => {
    const effectiveCwd = await normalizeCwd(cwd ?? opts.startupCwd);
    const now = Date.now();
    const cached = cache.get(effectiveCwd);
    if (cached && cached.expiresAt > now) return cached.url;

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
    cache.set(effectiveCwd, { url: result.serverUrl, expiresAt: now + cacheMs });
    return result.serverUrl;
  };
}
