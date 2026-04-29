/**
 * `ok mcp` stdio → HTTP MCP shim — byte/JSON-RPC proxy strategy.
 *
 * The shim is deliberately a transport-only bridge: bytes/JSON-RPC frames
 * arrive on stdin via `StdioServerTransport`, get forwarded as-is to the
 * server-owned Streamable HTTP MCP endpoint via `StreamableHTTPClientTransport`,
 * and responses flow back the other direction. There is no `McpServer` or
 * `McpClient` instantiation in this process — tool registry, capability
 * negotiation, and request handling all live in the running `ok start`
 * process at `/mcp`.
 *
 * Protocol awareness in the shim is limited to one read: when the HTTP side
 * delivers an `initialize` response, `maybeProtocolVersion` extracts
 * `result.protocolVersion` (string, e.g. "2025-06-18") so we can call
 * `http.setProtocolVersion(...)` and keep both transport halves in sync with
 * whatever the server negotiated. No framing decisions, no method routing,
 * no schema validation — the shim is otherwise version-agnostic.
 *
 * `resolveMcpHttpUrl` returning a URL string keeps the localhost-HTTP
 * transport socket-swappable: a future Future Work iteration (NG2) could
 * substitute a different URL/transport without touching the bridge code.
 */
import { type ChildProcess, spawn as nativeSpawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import {
  isProcessAlive as defaultIsProcessAlive,
  readServerLock,
  type ServerLockMetadata,
} from '@inkeep/open-knowledge-server';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';
import { resolveSelfSpawn } from '../commands/self-spawn.ts';

const DEFAULT_SPAWN_TIMEOUT_MS = 5000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const SPAWN_ERROR_LOG = 'last-spawn-error.log';

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

interface ResolveMcpHttpUrlOptions {
  lockDir: string;
  contentDir: string;
  host: string;
  portOverride?: string;
  envAutoStart?: string;
  configAutoStart?: boolean;
  spawn?: typeof nativeSpawn;
  readLock?: () => ServerLockMetadata | null;
  isAlive?: (pid: number) => boolean;
  sleep?: (ms: number) => Promise<void>;
  readErrorLog?: (path: string) => string;
  openErrorLog?: (path: string) => number;
  closeFd?: (fd: number) => void;
  timeoutMs?: number;
  pollIntervalMs?: number;
}

interface StartMcpShimOptions extends ResolveMcpHttpUrlOptions {
  stderr?: NodeJS.WritableStream;
}

function formatHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') return 'localhost';
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

function mcpUrlForPort(host: string, port: number): string {
  return `http://${formatHost(host)}:${port}/mcp`;
}

function livePortFromLock(
  lock: ServerLockMetadata | null,
  isAlive: (pid: number) => boolean,
): number | undefined {
  if (!lock || lock.port <= 0) return undefined;
  if (!isAlive(lock.pid)) return undefined;
  return lock.port;
}

function readErrorLogDefault(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf-8').trim() : '';
}

function formatTimeoutMessage(timeoutMs: number, stderr: string): string {
  const stderrBlock = stderr ? ` stderr:\n${stderr}` : '';
  return `server did not start within ${timeoutMs}ms${stderrBlock}`;
}

function requestIdOf(message: JSONRPCMessage): RequestId | undefined {
  if (message && typeof message === 'object' && 'method' in message && 'id' in message) {
    return message.id;
  }
  return undefined;
}

function maybeProtocolVersion(message: JSONRPCMessage): string | undefined {
  if (!message || typeof message !== 'object' || !('result' in message)) return undefined;
  const result = message.result;
  if (!result || typeof result !== 'object' || !('protocolVersion' in result)) return undefined;
  const version = result.protocolVersion;
  return typeof version === 'string' ? version : undefined;
}

function toErrorResponse(id: RequestId, err: unknown): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message: err instanceof Error ? err.message : String(err),
    },
  };
}

/**
 * Resolve the running `ok start` server's HTTP MCP URL, auto-starting it when
 * allowed. This is deliberately only a liveness/port resolver: no MCP protocol
 * version is read or compared in the shim.
 */
export async function resolveMcpHttpUrl(opts: ResolveMcpHttpUrlOptions): Promise<string> {
  const readLock = opts.readLock ?? (() => readServerLock(opts.lockDir));
  const isAlive = opts.isAlive ?? defaultIsProcessAlive;
  const sleep = opts.sleep ?? ((ms: number) => wait(ms));
  const spawnFn = opts.spawn ?? nativeSpawn;
  const readErrorLog = opts.readErrorLog ?? readErrorLogDefault;
  const openErrorLog = opts.openErrorLog ?? ((path: string) => openSync(path, 'w'));
  const closeFd = opts.closeFd ?? closeSync;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  if (opts.portOverride !== undefined) {
    const parsed = Number.parseInt(opts.portOverride, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(
        `invalid --port value '${opts.portOverride}' — HTTP MCP shim requires a positive port`,
      );
    }
    return mcpUrlForPort(opts.host, parsed);
  }

  const existingPort = livePortFromLock(readLock(), isAlive);
  if (existingPort !== undefined) return mcpUrlForPort('localhost', existingPort);

  if (opts.envAutoStart === '0') {
    throw new Error(
      'Open Knowledge server is not running and OK_MCP_AUTOSTART=0 disables auto-start.',
    );
  }
  if (opts.configAutoStart === false) {
    throw new Error(
      'Open Knowledge server is not running and config mcp.autoStart=false disables auto-start.',
    );
  }

  if (!existsSync(opts.lockDir)) mkdirSync(opts.lockDir, { recursive: true });
  const stderrPath = join(opts.lockDir, SPAWN_ERROR_LOG);
  const stderrFd = openErrorLog(stderrPath);
  let child: ChildProcess | undefined;
  let asyncSpawnError: string | undefined;
  const self = resolveSelfSpawn();

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
    } catch {
      // Best-effort — some mocks may not return a real fd.
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (asyncSpawnError) {
      const stderr = readErrorLog(stderrPath);
      const stderrBlock = stderr ? ` stderr:\n${stderr}` : '';
      throw new Error(`spawn failed: ${asyncSpawnError}${stderrBlock}`);
    }
    await sleep(pollIntervalMs);
    const port = livePortFromLock(readLock(), isAlive);
    if (port !== undefined) return mcpUrlForPort('localhost', port);
  }

  if (asyncSpawnError) {
    const stderr = readErrorLog(stderrPath);
    const stderrBlock = stderr ? ` stderr:\n${stderr}` : '';
    throw new Error(`spawn failed: ${asyncSpawnError}${stderrBlock}`);
  }

  throw new Error(formatTimeoutMessage(timeoutMs, readErrorLog(stderrPath)));
}

/** Bridge stdio JSON-RPC frames to the server-owned Streamable HTTP MCP endpoint. */
async function bridgeStdioToHttpMcp(
  endpointUrl: string,
  opts: { stderr?: NodeJS.WritableStream } = {},
): Promise<{ close: () => Promise<void> }> {
  const stderr = opts.stderr ?? process.stderr;
  const stdio = new StdioServerTransport();
  const http = new StreamableHTTPClientTransport(new URL(endpointUrl));
  let closed = false;

  const closeBoth = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await Promise.allSettled([stdio.close(), http.close()]);
  };

  stdio.onerror = (err) => {
    stderr.write(`[mcp-shim] stdio error: ${err.message}\n`);
  };
  http.onerror = (err) => {
    stderr.write(`[mcp-shim] HTTP transport error: ${err.message}\n`);
  };
  stdio.onclose = () => {
    void closeBoth();
  };
  http.onclose = () => {
    void closeBoth();
  };

  stdio.onmessage = (message) => {
    void (async () => {
      try {
        await http.send(message);
      } catch (err) {
        const id = requestIdOf(message);
        if (id !== undefined) {
          await stdio.send(toErrorResponse(id, err));
        }
      }
    })();
  };

  http.onmessage = (message) => {
    const protocolVersion = maybeProtocolVersion(message);
    if (protocolVersion) http.setProtocolVersion(protocolVersion);
    void stdio.send(message).catch((err) => {
      stderr.write(
        `[mcp-shim] failed to write stdio response: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    });
  };

  await http.start();
  await stdio.start();

  return { close: closeBoth };
}

export async function startMcpShim(opts: StartMcpShimOptions): Promise<void> {
  const stderr = opts.stderr ?? process.stderr;
  const endpointUrl = await resolveMcpHttpUrl(opts);
  stderr.write(`[mcp-shim] proxying stdio to ${endpointUrl}\n`);
  const bridge = await bridgeStdioToHttpMcp(endpointUrl, { stderr });

  const shutdown = (): void => {
    void bridge.close().finally(() => {
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
