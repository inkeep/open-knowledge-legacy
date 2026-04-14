/**
 * `open-knowledge mcp` command — starts stdio MCP server.
 *
 * All diagnostic logging goes to stderr.
 *
 * Port discovery: reads `<contentDir>/.open-knowledge/server.lock` (written by
 * `open-knowledge start` / `bun run dev`) to find a running server. If a live
 * lock with `port > 0` is present, MCP connects to that port. Otherwise, MCP
 * falls back to disk-only mode. An explicit `--port` override bypasses
 * discovery entirely.
 */

import { readServerLock } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { resolveContentDir, resolveLockDir } from '../config/paths.ts';
import type { Config } from '../config/schema.ts';
import { startMcpServer } from '../mcp/server.ts';

export interface DiscoveryResult {
  serverUrl: string | undefined;
  /** Human-readable log line describing the decision. Safe to emit to stderr. */
  message: string;
}

/**
 * Decide which WebSocket URL (if any) the MCP server should connect to.
 *
 * Precedence: explicit `--port` override > live `server.lock` with port > 0 >
 * disk-only. Exported for testing; the CLI action wraps this with stderr
 * logging + `startMcpServer`.
 */
export function discoverServerUrl(params: {
  lockDir: string;
  host: string;
  portOverride: string | undefined;
}): DiscoveryResult {
  const { lockDir, host, portOverride } = params;

  if (portOverride !== undefined) {
    const parsed = Number.parseInt(portOverride, 10);
    if (Number.isNaN(parsed)) {
      return {
        serverUrl: undefined,
        message: `invalid --port value '${portOverride}' — disk-only mode`,
      };
    }
    if (parsed > 0) {
      const serverUrl = `ws://${host}:${parsed}`;
      return { serverUrl, message: `using --port override, connecting to ${serverUrl}` };
    }
    return { serverUrl: undefined, message: '--port=0 — disk-only mode' };
  }

  const lock = readServerLock(lockDir);
  if (lock && lock.port > 0) {
    // Lock-based discovery uses localhost: the lock file is local, so the
    // server is on this machine. `localhost` resolves to whichever loopback
    // the OS prefers (IPv4 127.0.0.1 or IPv6 ::1), avoiding mismatches when
    // the server binds to IPv6 only. `host` is only meaningful for --port
    // overrides where the user may target a remote server.
    const serverUrl = `ws://localhost:${lock.port}`;
    return {
      serverUrl,
      message: `connected to running instance at ${serverUrl} (pid ${lock.pid})`,
    };
  }
  if (lock) {
    return {
      serverUrl: undefined,
      message: 'running instance still starting (port=0) — disk-only mode',
    };
  }
  return { serverUrl: undefined, message: 'no running instance — disk-only mode' };
}

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server for project knowledge base')
    .option(
      '-p, --port <port>',
      'Override port discovery and connect to this port (0 = disk-only)',
      undefined,
    )
    .action(async (opts: { port?: string }) => {
      try {
        const config = getConfig();
        const projectDir = process.cwd();
        const contentDir = resolveContentDir(config, projectDir);
        const lockDir = resolveLockDir(contentDir);

        const { serverUrl, message } = discoverServerUrl({
          lockDir,
          host: config.server.host,
          portOverride: opts.port,
        });
        process.stderr.write(`[mcp] ${message}\n`);

        await startMcpServer({
          projectDir,
          serverUrl,
          config,
        });
      } catch (err) {
        process.stderr.write(
          `MCP server failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  return cmd;
}
