/**
 * MCP stdio server — thin wiki server with init tool, instructions, and catalog auto-generation.
 *
 * Does NOT require Hocuspocus running. Agent uses native Read/Edit/Grep tools for file access.
 * MCP provides: instructions on connect, init tool, catalog auto-generation via file watcher.
 *
 * All diagnostic logging goes to stderr (stdout is the MCP wire).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadWikiConfig } from '../wiki/config.ts';
import { initWiki } from '../wiki/init.ts';
import { rebuildCatalogs, startCatalogWatcher } from '../wiki/watcher.ts';

export interface McpServerOptions {
  projectDir: string;
  serverUrl?: string;
}

function log(msg: string): void {
  process.stderr.write(`[mcp] ${msg}\n`);
}

const INSTRUCTIONS = `# Open Knowledge — Project Wiki

This project may have a \`.openknowledge/\` wiki for structured project knowledge.

## Navigation
1. Read \`.openknowledge/INDEX.md\` for a top-level overview of all wiki sections
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

## Getting Started
If \`.openknowledge/\` doesn't exist, use the \`init\` tool to scaffold the wiki structure.
`;

async function detectHocuspocus(serverUrl: string): Promise<boolean> {
  try {
    const httpUrl = serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const res = await fetch(`${httpUrl}/api/agent-undo-status`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function textResult(text: string, isError?: boolean) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) };
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

  // biome-ignore lint/suspicious/noExplicitAny: MCP SDK TS2589 workaround — deeply recursive generics
  const tool = server.tool.bind(server) as any;

  // Init tool
  tool(
    'init',
    'Scaffold .openknowledge/ wiki directory structure with articles/, external-sources/, research/, config.yaml, AGENTS.md, and starter catalogs',
    { project_dir: z.string().optional() },
    async (args: { project_dir?: string }) => {
      const dir = args.project_dir || projectDir;
      log(`init: scaffolding .openknowledge/ in ${dir}`);

      try {
        const result = initWiki(dir);
        const createdList =
          result.created.length > 0
            ? `Created: ${result.created.join(', ')}`
            : 'No new files created';
        const skippedList =
          result.skipped.length > 0 ? `Skipped (already exist): ${result.skipped.join(', ')}` : '';

        return textResult(
          [
            `Wiki scaffolded at ${resolve(dir, '.openknowledge')}/`,
            createdList,
            skippedList,
            '',
            'Next steps:',
            '1. Read .openknowledge/INDEX.md for navigation',
            '2. Write knowledge articles in .openknowledge/articles/',
            '3. INDEX.md catalogs will auto-generate as you add content',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      } catch (err) {
        return textResult(
          `Failed to scaffold wiki: ${err instanceof Error ? err.message : err}`,
          true,
        );
      }
    },
  );

  // Startup catalog rebuild
  const okDir = resolve(projectDir, '.openknowledge');
  let watcherHandle: { stop: () => Promise<void> } | null = null;

  if (existsSync(okDir)) {
    try {
      const config = loadWikiConfig(okDir);
      log('Rebuilding catalogs on startup...');
      rebuildCatalogs(okDir, config);
      log('Catalog rebuild complete');

      watcherHandle = await startCatalogWatcher(okDir, config);
      log('File watcher started');
    } catch (err) {
      log(`Warning: catalog setup failed: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    log('.openknowledge/ not found — run init tool to scaffold');
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
