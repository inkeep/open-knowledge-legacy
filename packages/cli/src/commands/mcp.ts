import type { Config } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { startGlobalMcpServer } from '../mcp/server.ts';
import { parseSpawnTimeoutEnv, startMcpShim } from '../mcp/shim.ts';

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server for project knowledge base')
    .option(
      '-p, --port <port>',
      'Override per-call routing and proxy stdio to this HTTP MCP port',
      undefined,
    )
    .action(async (opts: { port?: string }) => {
      try {
        const startupConfig = getConfig();
        const startupCwd = process.cwd();

        if (opts.port !== undefined) {
          const timeoutMs = parseSpawnTimeoutEnv(process.env.OK_MCP_SPAWN_TIMEOUT_MS);
          await startMcpShim({
            lockDir: '',
            contentDir: '',
            portOverride: opts.port,
            envAutoStart: process.env.OK_MCP_AUTOSTART,
            timeoutMs,
          });
          return;
        }

        await startGlobalMcpServer({
          startupCwd,
          startupConfig,
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
