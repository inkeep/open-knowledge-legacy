/**
 * MCP stdio server — content server with instructions and workflow tools.
 *
 * What this server provides:
 *   - Instructions on connect (the INSTRUCTIONS constant below)
 *   - Three workflow tools (init-content, ingest, research) registered from
 *     packages/cli/src/mcp/tools/ — each returns instructional text the agent follows
 *
 * Catalog auto-generation (INDEX.md per directory) is implemented in
 * packages/cli/src/content/{catalog,watcher,paths}.ts but currently disconnected.
 * It can be re-enabled when the catalog UX is revisited.
 *
 * Scaffolding (`.open-knowledge/` directory creation plus `.mcp.json` wiring) is a
 * terminal-side operation handled by the CLI `init` subcommand.
 *
 * Does NOT require Hocuspocus running. Agent uses native Read/Edit/Grep tools for
 * file access. All diagnostic logging goes to stderr (stdout is the MCP wire).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Config } from '../config/schema.ts';
import { OK_DIR } from '../constants.ts';
import { dim } from '../ui/colors.ts';
import { registerAllTools, TOOL_DESCRIPTIONS } from './tools/index.ts';

export interface McpServerOptions {
  projectDir: string;
  serverUrl?: string;
  config: Config;
}

/** MCP diagnostic log — must use stderr to avoid corrupting the MCP JSON-RPC protocol on stdout */
function log(msg: string): void {
  process.stderr.write(`${dim('[mcp]')} ${msg}\n`);
}

const INSTRUCTIONS = `# Open Knowledge — Project Knowledge Base

This project may have a \`.open-knowledge/\` directory for structured project knowledge.

## Getting Started
If \`.open-knowledge/\` doesn't exist yet, scaffolding is a **terminal-side** operation — the user (or the agent via \`Bash\`) runs \`open-knowledge init\` (or \`npx @inkeep/open-knowledge init\`) in the project root. That scaffolds the directory structure, registers this MCP server in \`.mcp.json\`, and returns. After scaffolding, reconnect the MCP client so this server sees the new directory and starts its file watcher.

This MCP server exposes three workflow tools (init-content, ingest, research) that return instructional text for agents to follow. Scaffolding belongs in the CLI; runtime behavior (tools, instructions) belongs here.

## Navigation
1. Read \`.open-knowledge/\` for structured project knowledge
2. Use grep to search across content for specific topics
3. Read specific articles for detailed context

## File Access
Use your native Read, Edit, Grep, and Glob tools for all file operations.

## Content Lifecycle
- \`external-sources/\` — Raw ingested content (URLs, documents). Reference material.
- \`research/\` — Analysis and synthesis. Provisional findings.
- \`articles/\` — Canonical knowledge. Architecture, processes, decisions. Source of truth.

## Writing Articles
- Add YAML frontmatter: \`title\` (required), \`description\` (required), \`tags\` (recommended)
- Keep articles focused on one topic
- Group by topic in subdirectories under articles/

## Workflow Tools
This server exposes three MCP tools that codify the main workflows. Each tool returns instructional text that guides the agent through the workflow — all real work (reads, edits, fetches) happens via the agent's native tools.

${Object.entries(TOOL_DESCRIPTIONS)
  .map(([name, desc]) => `### \`${name}\`\n${desc}`)
  .join('\n\n')}
`;

async function detectHocuspocus(serverUrl: string): Promise<boolean> {
  try {
    const httpUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const res = await fetch(`${httpUrl}/api/agent-undo-status`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch (err) {
    log(`Hocuspocus check failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const { projectDir, serverUrl } = options;

  // Detect Hocuspocus (non-blocking)
  let hocuspocusAvailable = false;
  if (serverUrl) {
    hocuspocusAvailable = await detectHocuspocus(serverUrl);
    log(
      hocuspocusAvailable
        ? `Hocuspocus detected at ${serverUrl}`
        : `Hocuspocus not available at ${serverUrl} — using disk-only mode`,
    );
  } else {
    log('No server URL configured — using disk-only mode');
  }

  const server = new McpServer(
    {
      name: 'open-knowledge',
      version: '0.0.1',
    },
    {
      instructions: INSTRUCTIONS,
    },
  );

  const okDir = resolve(projectDir, OK_DIR);

  // MCP workflow tools — cross-client workflow surface. Each tool's full body
  // lives in packages/cli/src/mcp/tools/<name>.ts. Each tool returns
  // instructional text the agent follows; all real work (reads, edits, fetches)
  // happens via the agent's native tools, not through the MCP server.
  registerAllTools(server);

  if (!existsSync(okDir)) {
    log('.open-knowledge/ not found — run `open-knowledge init` in your terminal to scaffold');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server running (stdio)');

  // Cleanup on exit
  process.on('SIGINT', () => {
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    process.exit(0);
  });
}
