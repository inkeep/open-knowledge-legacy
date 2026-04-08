/**
 * `open-knowledge mcp` command — starts stdio MCP server.
 *
 * Connects to a running Hocuspocus server via HTTP API.
 * All diagnostic logging goes to stderr.
 */
import { Command } from 'commander';
import type { Config } from '../config/schema';
import { startMcpServer } from '../mcp/server';

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server (connects to running Hocuspocus)')
    .action(async () => {
      const config = getConfig();
      const serverUrl = `ws://${config.server.host}:${config.server.port}`;
      await startMcpServer({ serverUrl });
    });

  return cmd;
}
