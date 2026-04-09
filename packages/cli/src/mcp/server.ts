/**
 * MCP stdio server — connects to a running Hocuspocus server via WebSocket
 * and exposes document operations as MCP tools.
 *
 * All diagnostic logging goes to stderr (stdout is the MCP wire).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { dim } from '../ui/colors.ts';
import { registerTools } from './tools.ts';

export interface McpServerOptions {
  serverUrl: string;
  contentDir: string;
}

function log(msg: string): void {
  process.stderr.write(`${dim('[mcp]')} ${msg}\n`);
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const { serverUrl, contentDir } = options;

  // Verify server is reachable before starting
  try {
    const httpUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const res = await fetch(`${httpUrl}/api/agent-undo-status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch {
    process.stderr.write(
      `Server not running at ${serverUrl}. Start it with: open-knowledge start\n`,
    );
    process.exit(1);
  }

  const server = new McpServer({
    name: 'open-knowledge',
    version: '0.0.1',
  });

  const httpUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
  registerTools(server, httpUrl, contentDir);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  log(`Connected to ${serverUrl}`);
}
