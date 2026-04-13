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
import { setProjectDir } from '../bash/index.ts';
import type { Config } from '../config/schema.ts';
import { OK_DIR } from '../constants.ts';
import { IndexMdCatalogStore } from '../content/catalog-store.ts';
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

This MCP server exposes workflow tools (init-content, ingest, research, consolidate) that return instructional text for agents to follow, enriched read/search tools that bundle metadata + git history + backlinks, and document tools that route writes through the Hocuspocus CRDT layer. Scaffolding belongs in the CLI; runtime behavior (catalogs, watcher, tools, instructions) belongs here.

## Navigation — preferred tools for wiki content

- **Reading a file:** Use \`read_document\` (not native \`Read\`). It returns contents + frontmatter metadata + recent git history + backlinks + parent folder catalog context in one call.
- **Searching:** Use \`search\` (not native \`Grep\`). Results are grouped by file with article metadata attached, so you can judge relevance before opening each file.
- **Browsing the structure:** Read \`.open-knowledge/catalogs/<path>/INDEX.md\` natively. Catalogs are auto-generated markdown that mirror the project tree, with article listings, folder descriptions, and subfolder links.

## Navigation — fallback

Native \`Read\`, \`Grep\`, \`Glob\` still work for any file — use them when the enriched tools aren't necessary (e.g., reading code, scanning non-wiki content, or the MCP server isn't the bottleneck).

Catalogs live in \`.open-knowledge/catalogs/\` and never pollute the source tree.

## Content Lifecycle
- \`external-sources/\` — Raw ingested content (URLs, documents). Reference material. Use \`ingest\`.
- \`research/\` — Analysis and synthesis. Provisional findings. Use \`research\`.
- \`articles/\` — Canonical knowledge. Architecture, processes, decisions. Source of truth. Use \`consolidate\` to promote research → articles.

## Writing Articles
- Add YAML frontmatter: \`title\` (required), \`description\` (required), \`tags\` (recommended)
- Keep articles focused on one topic
- Group by topic in subdirectories under articles/

## Tools
Three groups:
- **Workflow tools** (init-content, ingest, research, consolidate) — return instructional text you follow
- **Enriched tools** (read_document, search) — one-call wiki reads/searches with metadata
- **Document tools** (write_document, edit_document, list_documents, undo_agent_edit, redo_agent_edit, get_backlinks, get_forward_links, get_orphans, get_hubs) — route through Hocuspocus when available

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

  function onEvents(events: Array<{ path: string }>): void {
    const hasRelevantChange = events.some((e) => {
      const rel = relative(projectDir, e.path);
      return isTrackedContent(rel, include, exclude);
    });
    if (hasRelevantChange) {
      scheduleRebuild();
    }
  }

  // Try @parcel/watcher, fall back to chokidar
  let stopFn!: () => Promise<void>;
  let parcel: typeof import('@parcel/watcher') | null = null;
  try {
    parcel = await import('@parcel/watcher');
  } catch (err) {
    console.warn(
      '[content-watcher] @parcel/watcher import failed:',
      err instanceof Error ? err.message : err,
    );
  }

  if (parcel) {
    try {
      const subscription = await parcel.subscribe(
        projectDir,
        (_err, events) => {
          if (_err) {
            console.error('[content-watcher]', _err);
            return;
          }
          onEvents(events);
        },
        { ignore: ['node_modules', '.git', '.claude'] },
      );
      stopFn = () => subscription.unsubscribe();
    } catch (err) {
      console.warn(
        '[content-watcher] @parcel/watcher subscribe failed, using chokidar fallback:',
        err,
      );
      parcel = null;
    }
  }

  if (!parcel) {
    const { watch } = await import('chokidar');
    console.warn('[content-watcher] @parcel/watcher unavailable, using chokidar fallback');
    const watcher = watch(projectDir, {
      ignoreInitial: true,
      ignored: ['**/node_modules/**', '**/.git/**', '**/.claude/**'],
    });
    watcher.on('error', (err) => console.error('[content-watcher] chokidar error:', err));
    watcher.on('add', (path) => onEvents([{ path }]));
    watcher.on('change', (path) => onEvents([{ path }]));
    watcher.on('unlink', (path) => onEvents([{ path }]));
    stopFn = () => watcher.close();
  }

  return {
    stop: async () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (maxWaitTimer) clearTimeout(maxWaitTimer);
      await stopFn();
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

  // MCP tools — workflow tools + document tools + enriched tools
  const httpUrl = serverUrl
    ? serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')
    : undefined;
  // Bash wrapper scopes all shell ops to projectDir (see bash/index.ts).
  setProjectDir(projectDir);
  const catalog = new IndexMdCatalogStore({ projectDir });
  registerAllTools(server, { serverUrl: httpUrl, projectDir, config, catalog });

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
