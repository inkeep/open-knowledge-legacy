/**
 * `open-knowledge mcp` command — starts stdio MCP server.
 *
 * All diagnostic logging goes to stderr.
 */
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';
import { startMcpServer } from '../mcp/server.ts';

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server for project knowledge base')
    .action(async () => {
      try {
        const config = getConfig();
        const serverUrl = `ws://${config.server.host}:${config.server.port}`;
        await startMcpServer({
          projectDir: process.cwd(),
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
