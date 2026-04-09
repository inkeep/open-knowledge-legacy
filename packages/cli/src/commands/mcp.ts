/**
 * `open-knowledge mcp` command — starts stdio MCP server.
 *
 * Connects to a running Hocuspocus server via HTTP API.
 * All diagnostic logging goes to stderr.
 */
import { resolve } from 'node:path';
import { Command } from 'commander';
import type { Config } from '../config/schema.ts';
import { startMcpServer } from '../mcp/server.ts';

export function mcpCommand(getConfig: () => Config): Command {
  const cmd = new Command('mcp')
    .description('Start MCP stdio server (connects to running Hocuspocus)')
    .action(async () => {
      const config = getConfig();
      const serverUrl = `ws://${config.server.host}:${config.server.port}`;
      const contentDir = resolve(process.cwd(), config.content.dir);
      await startMcpServer({ serverUrl, contentDir });
    });

  return cmd;
}
