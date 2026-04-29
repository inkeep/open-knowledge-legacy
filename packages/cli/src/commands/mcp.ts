/**
 * `open-knowledge mcp` command — thin stdio → HTTP MCP shim.
 *
 * All diagnostic logging goes to stderr; stdout is reserved for MCP frames.
 * The running `ok start` process owns the MCP implementation at `/mcp`.
 * This command only resolves the live server port (or auto-starts `ok start`)
 * and proxies stdio JSON-RPC to Streamable HTTP.
 */

import { Command } from 'commander';
import { resolveContentDir, resolveLockDir } from '../config/paths.ts';
import type { Config } from '../config/schema.ts';
import { parseSpawnTimeoutEnv, startMcpShim } from '../mcp/shim.ts';

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server for project knowledge base')
    .option(
      '-p, --port <port>',
      'Override port discovery and proxy to this HTTP MCP port',
      undefined,
    )
    .action(async (opts: { port?: string }) => {
      try {
        const startupConfig = getConfig();
        const projectDir = process.cwd();
        const contentDir = resolveContentDir(startupConfig, projectDir);
        const timeoutMs = parseSpawnTimeoutEnv(process.env.OK_MCP_SPAWN_TIMEOUT_MS);

        await startMcpShim({
          lockDir: resolveLockDir(contentDir),
          contentDir,
          host: startupConfig.server.host,
          portOverride: opts.port,
          envAutoStart: process.env.OK_MCP_AUTOSTART,
          configAutoStart: startupConfig.mcp.autoStart,
          timeoutMs,
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
