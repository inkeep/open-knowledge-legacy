/**
 * `open-knowledge mcp` command — starts stdio MCP server.
 *
 * Works standalone (disk-only) or with optional Hocuspocus for live sync.
 * All diagnostic logging goes to stderr.
 */
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';
import { startMcpServer } from '../mcp/server.ts';

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server for project wiki')
    .action(async () => {
      const config = getConfig();
      const serverUrl = `ws://${config.server.host}:${config.server.port}`;
      await startMcpServer({
        projectDir: process.cwd(),
        serverUrl,
        config,
      });
    });

  return cmd;
}
