/**
 * MCP stdio server — thin wiki server with instructions, catalog auto-generation, and workflow tools.
 *
 * What this server provides:
 *   - Instructions on connect (the INSTRUCTIONS constant below)
 *   - Catalog auto-generation via file watcher on `.open-knowledge/`
 *   - Three workflow tools (init-wiki, ingest, research) registered from
 *     packages/cli/src/mcp/prompts/ — each returns instructional text the agent follows
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
import { WIKI_DIR } from '../constants.ts';
import { dim } from '../ui/colors.ts';
import { resolveWikiPaths } from '../wiki/paths.ts';
import { rebuildCatalogs, startCatalogWatcher } from '../wiki/watcher.ts';
import { registerAllTools, TOOL_DESCRIPTIONS } from './prompts/index.ts';

export interface McpServerOptions {
  projectDir: string;
  serverUrl?: string;
  config: Config;
}

/** MCP diagnostic log — must use stderr to avoid corrupting the MCP JSON-RPC protocol on stdout */
function log(msg: string): void {
  process.stderr.write(`${dim('[mcp]')} ${msg}\n`);
}

const INSTRUCTIONS = `# Open Knowledge — Project Wiki

This project may have a \`.open-knowledge/\` wiki for structured project knowledge.

## Getting Started
If \`.open-knowledge/\` doesn't exist yet, scaffolding is a **terminal-side** operation — the user (or the agent via \`Bash\`) runs \`open-knowledge init\` (or \`npx @inkeep/open-knowledge init\`) in the project root. That scaffolds the directory structure, registers this MCP server in \`.mcp.json\`, and returns. After scaffolding, reconnect the MCP client so this server sees the new directory and starts its file watcher.

This MCP server exposes three workflow tools (init-wiki, ingest, research) that return instructional text for agents to follow. Scaffolding belongs in the CLI; runtime behavior (catalogs, watcher, tools, instructions) belongs here.

## Navigation
1. Read \`.open-knowledge/INDEX.md\` for a top-level overview of all wiki sections
2. Follow links to section INDEX.md files (articles/, external-sources/, research/)
3. Use grep to search across wiki content for specific topics
4. Read specific articles for detailed context

## File Access
Use your native Read, Edit, Grep, and Glob tools for all file operations. The MCP server handles catalog generation automatically — you don't need to update INDEX.md files.

## Content Lifecycle
- \`external-sources/\` — Raw ingested content (URLs, documents). Reference material.
- \`research/\` — Analysis and synthesis. Provisional findings.
- \`articles/\` — Canonical knowledge. Architecture, processes, decisions. Source of truth.

## Writing Articles
- Add YAML frontmatter: \`title\` (required), \`description\` (required), \`tags\` (recommended)
- Keep articles focused on one topic
- Group by topic in subdirectories under articles/
- INDEX.md catalogs regenerate automatically when you create or modify articles

## Workflow Tools
This server exposes three MCP tools that codify the main workflows. Each tool returns instructional text that guides the agent through the workflow — all real work (reads, edits, fetches) happens via the agent's native tools.

${Object.entries(TOOL_DESCRIPTIONS)
  .map(([name, desc]) => `### \`${name}\`\n${desc}`)
  .join('\n\n')}

## Folder Descriptions
When you create a new subfolder (e.g., \`articles/auth/\`), set \`title\` and \`description\` in that subfolder's \`INDEX.md\` frontmatter. These two fields are sticky — preserved across every catalog rebuild — and surface in the parent folder's Subfolders list so readers know what's inside without opening it. Do this at the same time you create the first article in the folder.

**Every time you create or edit an article, also check the containing folder's \`INDEX.md\` and decide if the folder's \`title\` or \`description\` needs to be updated.** If you add an RBAC article to \`articles/auth/\`, the folder description should probably mention authorization too. If an article's scope shifts, the folder framing may be stale. The check is cheap (one read); the cost of a stale folder description is that future agents get a misleading map of the wiki.

**Only \`title\` and \`description\` are editable in INDEX.md.** Everything else (the \`generated\`/\`schema_version\` fields, the \`## Articles\` body, the \`## Subfolders\` body) is auto-regenerated and will be overwritten on the next rebuild.
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
  const { projectDir, serverUrl, config } = options;

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

  // Shared catalog state — populated by the startup block when `.open-knowledge/`
  // already exists. If the user scaffolds the wiki via `open-knowledge init` while
  // this server is running, they need to reconnect so startup runs again.
  const okDir = resolve(projectDir, WIKI_DIR);
  let watcherHandle: { stop: () => Promise<void> } | null = null;

  async function ensureCatalogs(): Promise<void> {
    if (!existsSync(okDir)) return;
    try {
      const paths = resolveWikiPaths(config, okDir);
      rebuildCatalogs(okDir, paths);
      log('Catalogs rebuilt');
      if (!watcherHandle) {
        watcherHandle = await startCatalogWatcher(okDir, paths);
        log('File watcher started');
      }
    } catch (err) {
      log(`Warning: catalog setup failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // MCP workflow tools — cross-client workflow surface. Each tool's full body
  // lives in packages/cli/src/mcp/prompts/<name>.ts. Each tool returns
  // instructional text the agent follows; all real work (reads, edits, fetches)
  // happens via the agent's native tools, not through the MCP server.
  registerAllTools(server);

  // Startup catalog rebuild + watcher (no-op if .open-knowledge/ doesn't exist yet)
  if (existsSync(okDir)) {
    await ensureCatalogs();
  } else {
    log('.open-knowledge/ not found — run `open-knowledge init` in your terminal to scaffold');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server running (stdio)');

  // Cleanup on exit
  process.on('SIGINT', async () => {
    if (watcherHandle) await watcherHandle.stop();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    if (watcherHandle) await watcherHandle.stop();
    process.exit(0);
  });
}
