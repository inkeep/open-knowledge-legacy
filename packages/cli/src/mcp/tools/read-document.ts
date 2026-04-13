/**
 * `read_document` MCP tool — enriched read.
 *
 * Single-call read that returns:
 *   - File contents (the file's raw markdown, frontmatter and all)
 *   - Article metadata parsed from the file's frontmatter (title / description / tags)
 *   - Parent folder catalog context (title / description from the folder's INDEX.md)
 *   - Recent git history (last N commits, optionally filtered by `since`)
 *   - Backlinks (if Hocuspocus is available — graceful degrade when not, per D2)
 *
 * See spec: specs/2026-04-12-enriched-read-tools/SPEC.md § Tool 1.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { type GitLogEntry, gitLog } from '../../bash/index.ts';
import type { Config } from '../../config/schema.ts';
import {
  type CatalogData,
  type CatalogStore,
  parentDirOf,
  toProjectRelative,
} from '../../content/catalog-store.ts';
import { parseFrontmatter } from '../../utils/frontmatter.ts';
import type { ServerInstance } from './shared.ts';
import { httpGet, textResult } from './shared.ts';

export const DESCRIPTION = [
  'Read a wiki file with enriched context: contents + frontmatter metadata + recent git history + backlinks (if Hocuspocus is running) + parent folder catalog context.',
  '',
  '**Use when:**',
  '- Loading an article for context',
  '- Understanding what changed recently in a file (optional `since` timestamp)',
  '- Seeing which other pages link to this one',
  '',
  'Prefer this over your native `Read` for wiki files — one call returns what otherwise takes 3-4.',
  '',
  '**Parameters:**',
  '- `path` — Project-root-relative path to the file (e.g. `articles/auth/sso.md`)',
  '- `since` (optional) — ISO timestamp; filter git history to commits after this time',
].join('\n');

export interface ReadDocumentDeps {
  catalog: CatalogStore;
  projectDir: string;
  config: Config;
  serverUrl: string | undefined;
}

interface BacklinkEntry {
  docName: string;
  title?: string;
  snippet?: string;
}

function formatHistory(entries: GitLogEntry[]): string {
  if (entries.length === 0) return '';
  const lines = ['', '### Recent changes', ''];
  for (const e of entries) {
    lines.push(`- ${e.hash} ${e.date} ${e.subject}`);
  }
  return lines.join('\n');
}

function formatBacklinks(backlinks: BacklinkEntry[]): string {
  if (backlinks.length === 0) return '';
  const lines = ['', `### Backlinks (${backlinks.length})`, ''];
  for (const b of backlinks) {
    const title = b.title ? ` — ${b.title}` : '';
    lines.push(`- ${b.docName}${title}`);
  }
  return lines.join('\n');
}

function formatCatalogContext(folder: CatalogData | null): string {
  if (!folder) return '';
  if (!folder.title && !folder.description) return '';
  const parts: string[] = [];
  if (folder.title) parts.push(`**Folder:** ${folder.title}`);
  if (folder.description) parts.push(`_${folder.description}_`);
  return parts.join(' — ');
}

function pathToDocName(relPath: string): string {
  return relPath.replace(/\.md$/, '');
}

async function fetchBacklinks(
  serverUrl: string | undefined,
  docName: string,
): Promise<BacklinkEntry[] | null> {
  if (!serverUrl) return null;
  const result = await httpGet(serverUrl, `/api/backlinks?docName=${encodeURIComponent(docName)}`);
  if (!result.ok) return null;
  // Response shape from the backlinks endpoint is `{ ok, backlinks: [...] }` (or similar).
  // Be tolerant — we accept anything that looks like an array of objects with a page identifier.
  const raw = (result.backlinks ?? result.results ?? result.links) as unknown;
  if (!Array.isArray(raw)) return [];
  const entries: BacklinkEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const sourceDocName =
      typeof rec.docName === 'string'
        ? rec.docName
        : typeof rec.source === 'string'
          ? rec.source
          : typeof rec.page === 'string'
            ? rec.page
            : undefined;
    if (!sourceDocName) continue;
    entries.push({
      docName: sourceDocName,
      title: typeof rec.title === 'string' ? rec.title : undefined,
      snippet: typeof rec.snippet === 'string' ? rec.snippet : undefined,
    });
  }
  return entries;
}

const ArticleFrontmatterSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export async function buildReadResult(
  args: { path: string; since?: string },
  deps: ReadDocumentDeps,
): Promise<string> {
  const relPath = toProjectRelative(deps.projectDir, args.path);
  const historyDepth = deps.config.mcp.tools.read_document.historyDepth;
  const docName = pathToDocName(relPath);
  const abs = resolve(deps.projectDir, relPath);

  // Step 2 (read content) is the precondition for step 4 (parse frontmatter).
  // Steps 3, 5, 6 are independent; run them in parallel with step 2.
  // Only content is critical — enrichment ops degrade gracefully (per D2).
  const [content, history, folder, backlinks] = await Promise.all([
    readFile(abs, 'utf-8'),
    gitLog(relPath, historyDepth, args.since).catch(() => [] as GitLogEntry[]),
    deps.catalog.getCatalog(parentDirOf(relPath)).catch(() => null),
    fetchBacklinks(deps.serverUrl, docName).catch(() => null),
  ]);

  const fm = parseFrontmatter(content, ArticleFrontmatterSchema);
  const basename = relPath.split('/').pop()?.replace(/\.md$/, '') ?? relPath;
  const title = fm?.title ?? basename;
  const description = fm?.description ?? '';
  const tags = fm?.tags ?? [];

  // Compose output
  const lines: string[] = [];
  lines.push(`## ${title}`);
  if (description) lines.push(`**Description:** ${description}`);
  if (tags.length > 0) lines.push(`**Tags:** ${tags.join(', ')}`);
  lines.push(`**Path:** ${relPath}`);
  const folderLine = formatCatalogContext(folder);
  if (folderLine) lines.push(folderLine);

  const historySection = formatHistory(history);
  if (historySection) lines.push(historySection);
  if (backlinks !== null) {
    const backlinksSection = formatBacklinks(backlinks);
    if (backlinksSection) lines.push(backlinksSection);
  }

  lines.push('', '### Content', '', content);
  return lines.join('\n');
}

export function register(server: ServerInstance, deps: ReadDocumentDeps): void {
  server.tool(
    'read_document',
    DESCRIPTION,
    {
      path: z.string().describe('Project-root-relative path to the file'),
      since: z
        .string()
        .optional()
        .describe('Optional ISO timestamp; filter git history to commits after this time'),
    },
    async (args: { path: string; since?: string }) => {
      try {
        const body = await buildReadResult(args, deps);
        return textResult(body);
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );
}
