/**
 * MCP stdio server — content server with instructions, mirrored catalog
 * auto-generation, and workflow tools.
 *
 * What this server provides:
 *   - Instructions on connect (the INSTRUCTIONS constant below)
 *   - Mirrored catalog auto-generation: scans project for content files
 *     matching config globs, writes INDEX.md catalogs inside
 *     `.open-knowledge/catalogs/` (never pollutes the source tree)
 *   - Three workflow tools (init-content, ingest, research) registered from
 *     packages/cli/src/mcp/tools/ — each returns instructional text the agent follows
 *
 * Scaffolding (`.open-knowledge/` directory creation plus `.mcp.json` wiring) is a
 * terminal-side operation handled by the CLI `init` subcommand.
 *
 * Does NOT require Hocuspocus running. Agent uses native Read/Edit/Grep tools for
 * file access. All diagnostic logging goes to stderr (stdout is the MCP wire).
 */
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { type AsyncSubscription, subscribe } from '@parcel/watcher';
import type { Config } from '../config/schema.ts';
import { OK_DIR } from '../constants.ts';
import { isTrackedContent, rebuildMirroredCatalogs } from '../content/mirror-catalog.ts';
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

This MCP server exposes three workflow tools (init-content, ingest, research) that return instructional text for agents to follow. Scaffolding belongs in the CLI; runtime behavior (catalogs, watcher, tools, instructions) belongs here.

## Navigation
1. Read \`.open-knowledge/catalogs/INDEX.md\` for a top-level overview of all tracked content
2. Follow links to subdirectory catalogs for deeper navigation
3. Use grep to search across content for specific topics
4. Read specific articles for detailed context

Catalogs are auto-generated inside \`.open-knowledge/catalogs/\` — they mirror the project's directory structure without polluting the source tree.

## File Access
Use your native Read, Edit, Grep, and Glob tools for all file operations. The MCP server handles catalog generation automatically.

## Content Lifecycle
- \`external-sources/\` — Raw ingested content (URLs, documents). Reference material.
- \`research/\` — Analysis and synthesis. Provisional findings.
- \`articles/\` — Canonical knowledge. Architecture, processes, decisions. Source of truth.

## Writing Articles
- Add YAML frontmatter: \`title\` (required), \`description\` (required), \`tags\` (recommended)
- Keep articles focused on one topic
- Group by topic in subdirectories under articles/

## Tools
This server exposes workflow tools (init-content, ingest, research) that return instructional text, and document tools (write_document, edit_document, list_documents, undo_agent_edit, redo_agent_edit) that operate through the Hocuspocus CRDT layer when available.

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

// ── Catalog watcher ────────────────────────────────────────────────────

const DEBOUNCE_QUIET_MS = 500;
const DEBOUNCE_MAX_MS = 2000;

interface CatalogWatcher {
  stop: () => Promise<void>;
}

async function startCatalogWatcher(
  projectDir: string,
  okDir: string,
  config: Config,
): Promise<CatalogWatcher> {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingRebuild = false;

  const catalogOptions = {
    projectDir,
    okDir,
    include: config.content.include,
    exclude: config.content.exclude,
  };

  function scheduleRebuild(): void {
    pendingRebuild = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(executeRebuild, DEBOUNCE_QUIET_MS);
    if (!maxWaitTimer) {
      maxWaitTimer = setTimeout(executeRebuild, DEBOUNCE_MAX_MS);
    }
  }

  function executeRebuild(): void {
    if (!pendingRebuild) return;
    pendingRebuild = false;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (maxWaitTimer) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
    try {
      rebuildMirroredCatalogs(catalogOptions);
    } catch (err) {
      console.error('[content-watcher] Catalog rebuild failed:', err);
    }
  }

  const { include, exclude } = config.content;

  const subscription: AsyncSubscription = await subscribe(
    projectDir,
    (_err, events) => {
      if (_err) {
        console.error('[content-watcher]', _err);
        return;
      }
      const hasRelevantChange = events.some((e) => {
        const rel = relative(projectDir, e.path);
        return isTrackedContent(rel, include, exclude);
      });
      if (hasRelevantChange) {
        scheduleRebuild();
      }
    },
    {
      ignore: ['node_modules', '.git', '.claude'],
    },
  );

  return {
    stop: async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (maxWaitTimer) clearTimeout(maxWaitTimer);
      await subscription.unsubscribe();
    },
  };
}

// ── Server entrypoint ──────────────────────────────────────────────────

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

  const okDir = resolve(projectDir, OK_DIR);
  let watcherHandle: CatalogWatcher | null = null;

  // MCP tools — workflow tools + document tools (document tools need httpUrl)
  const httpUrl = serverUrl
    ? serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')
    : undefined;
  registerAllTools(server, httpUrl);

  // Catalog rebuild + watcher
  if (existsSync(okDir)) {
    try {
      rebuildMirroredCatalogs({
        projectDir,
        okDir,
        include: config.content.include,
        exclude: config.content.exclude,
      });
      log('Catalogs rebuilt');
      watcherHandle = await startCatalogWatcher(projectDir, okDir, config);
      log('File watcher started');
    } catch (err) {
      log(`Warning: catalog setup failed: ${err instanceof Error ? err.message : err}`);
    }
  } else {
    log('.open-knowledge/ not found — run `open-knowledge init` in your terminal to scaffold');
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('MCP server running (stdio)');

  // Cleanup on exit
  const shutdown = async () => {
    try {
      if (watcherHandle) await watcherHandle.stop();
    } catch (err) {
      log(`Warning: watcher cleanup failed: ${err instanceof Error ? err.message : err}`);
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
