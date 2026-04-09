/**
 * MCP stdio server — thin wiki server with instructions, catalog auto-generation, and prompts.
 *
 * This server exposes **no tools**. Scaffolding (`.open-knowledge/` directory creation
 * plus `.mcp.json` wiring) is a terminal-side operation handled by the CLI `init`
 * subcommand (`packages/cli/src/commands/init.ts`). That's deliberate — scaffolding
 * has to run *before* any MCP server is configured, so it can't live inside the MCP
 * server without creating a chicken-and-egg problem.
 *
 * What this server does provide:
 *   - Instructions on connect (the INSTRUCTIONS constant below)
 *   - Catalog auto-generation via file watcher on `.open-knowledge/`
 *   - Three cross-client workflow prompts (init-wiki, ingest, research) registered
 *     from packages/cli/src/mcp/prompts/ so this file stays focused on lifecycle
 *
 * Does NOT require Hocuspocus running. Agent uses native Read/Edit/Grep tools for
 * file access. All diagnostic logging goes to stderr (stdout is the MCP wire).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Config } from '../config/schema.ts';
import { resolveWikiPaths } from '../wiki/paths.ts';
import { rebuildCatalogs, startCatalogWatcher } from '../wiki/watcher.ts';
import { registerAllPrompts } from './prompts/index.ts';

export interface McpServerOptions {
  projectDir: string;
  serverUrl?: string;
  config: Config;
}

function log(msg: string): void {
  process.stderr.write(`[mcp] ${msg}\n`);
}

const INSTRUCTIONS = `# Open Knowledge — Project Wiki

This project may have a \`.open-knowledge/\` wiki for structured project knowledge.

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

## Workflow Prompts
This server exposes three MCP prompts that codify the main workflows. Invoke them via your client's prompt UI (Claude Code: slash menu as \`mcp__openknowledge__<name>\`; Cursor/Windsurf/Codex/other MCP clients: whatever prompt menu your client provides). The canonical names are:

- \`mcp__openknowledge__init-wiki\` — bootstrap a new wiki by reading the codebase and writing initial articles grouped by topic
- \`mcp__openknowledge__ingest\` — capture an external source (URL or local file) as raw reference material in \`external-sources/\`
- \`mcp__openknowledge__research\` — gather sources via \`ingest\` and write provisional findings to \`research/\`

The MCP server has no slash-command-file dependency — these prompts are discovered via the standard MCP \`prompts/list\` handshake and work in any client that supports it. The names above are canonical; refer to them as \`mcp__openknowledge__<name>\` in docs and conversation so they're unambiguous across clients.

## Folder Descriptions
When you create a new subfolder (e.g., \`articles/auth/\`), set \`title\` and \`description\` in that subfolder's \`INDEX.md\` frontmatter. These two fields are sticky — preserved across every catalog rebuild — and surface in the parent folder's Subfolders list so readers know what's inside without opening it. Do this at the same time you create the first article in the folder.

**Every time you create or edit an article, also check the containing folder's \`INDEX.md\` and decide if the folder's \`title\` or \`description\` needs to be updated.** If you add an RBAC article to \`articles/auth/\`, the folder description should probably mention authorization too. If an article's scope shifts, the folder framing may be stale. The check is cheap (one read); the cost of a stale folder description is that future agents get a misleading map of the wiki.

**Only \`title\` and \`description\` are editable in INDEX.md.** Everything else (the \`generated\`/\`schema_version\` fields, the \`## Articles\` body, the \`## Subfolders\` body) is auto-regenerated and will be overwritten on the next rebuild.

## Getting Started
If \`.open-knowledge/\` doesn't exist yet, scaffolding is a **terminal-side** operation — the user (or the agent via \`Bash\`) runs \`open-knowledge init\` (or \`npx @inkeep/open-knowledge init\`) in the project root. That scaffolds the directory structure, registers this MCP server in \`.mcp.json\`, and returns. After scaffolding, reconnect the MCP client so this server sees the new directory and starts its file watcher.

This MCP server intentionally exposes **no tools** — scaffolding belongs in the CLI, runtime behavior (catalogs, watcher, prompts, instructions) belongs here.
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
  const okDir = resolve(projectDir, '.open-knowledge');
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

  // This MCP server exposes no tools. Scaffolding moved to the CLI
  // (`open-knowledge init`) because it's a one-shot setup operation that has
  // to run *before* any MCP server is configured — see the design note at the
  // top of packages/cli/src/commands/init.ts for the full rationale.
  //
  // Runtime operations (watching files, regenerating catalogs, serving
  // instructions, exposing workflow prompts) are what this server does.

  // MCP prompts — cross-client workflow surface. Each prompt's full body
  // lives in packages/cli/src/mcp/prompts/<name>.ts. Claude Code surfaces
  // them as `mcp__openknowledge__<name>` in the slash menu; other MCP clients
  // (Cursor, Windsurf, Cline, etc.) use their own prompt UX. Each prompt body
  // is a one-shot natural-language instruction the agent follows; all real
  // work (reads, edits, fetches) happens via the agent's native tools, not
  // through the MCP server.
  //
  // biome-ignore lint/suspicious/noExplicitAny: MCP SDK TS2589 workaround — deeply recursive generics
  const prompt = server.prompt.bind(server) as any;
  registerAllPrompts(prompt);

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
