/**
 * `read_document` MCP tool — enriched read.
 *
 * Single-call read that returns:
 *   - File contents (raw markdown, frontmatter and all)
 *   - Article metadata parsed from frontmatter (title / description / tags)
 *   - Recent shadow-repo activity with per-writer attribution (agent vs human)
 *   - Backlink count (when Hocuspocus is available — graceful degrade per FR9)
 *
 * Enrichment is fully delegated to the shared `enrichPath()` helper (D4/D13).
 * CC9 parity with `exec("cat X.md")` is by construction: both surfaces read
 * the same helper.
 *
 * Folder-catalog context is intentionally absent — folder INDEX.md
 * frontmatter was deprecated in D19.
 *
 * Spec: SPEC.md FR7 + FR15 + D13 + D19.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Config } from '../../config/schema.ts';
import type { BacklinkEntry, GitCommit } from '../../content/enrichment.ts';
import { enrichPath } from '../../content/enrichment.ts';
import type { ShadowCommit } from '../../content/shadow-log.ts';
import type { ServerInstance } from './shared.ts';
import { textResult } from './shared.ts';

export const DESCRIPTION = [
  'Read a wiki file with enriched context: contents + frontmatter metadata + recent shadow-repo activity (agent vs human attribution) + backlink count.',
  '',
  '**Use when:**',
  '- Loading an article for context',
  '- Understanding who changed a file recently and whether it was an agent or human',
  '- Seeing how many other pages link to this one',
  '',
  'Prefer this over your native `Read` for wiki files — one call returns what otherwise takes 3-4.',
  '',
  '**Parameters:**',
  '- `path` — Project-root-relative path to the file, including extension (e.g. `articles/auth/sso.md`). To pass this document to `edit_document` / `write_document` / `get_backlinks`, strip the extension (they take extension-less `docName`).',
  '- `since` (reserved) — Reserved for shadow-log since-filter; currently unused.',
].join('\n');

export interface ReadDocumentDeps {
  projectDir: string;
  config: Config;
  serverUrl: string | undefined;
}

function formatShadowHistory(entries: ShadowCommit[] | null): string {
  if (!entries || entries.length === 0) return '';
  const lines: string[] = ['', '### Recent activity (OK edits)', ''];
  for (const e of entries) {
    const who =
      e.writerClassification === 'agent'
        ? `agent: ${e.writerName}`
        : e.writerClassification === 'human'
          ? `human: ${e.writerName}`
          : `${e.writerClassification}: ${e.writerName}`;
    const hash = e.hash.slice(0, 7);
    lines.push(`- ${hash} ${e.date} [${who}] ${e.message}`);
  }
  return lines.join('\n');
}

function formatProjectHistory(entries: GitCommit[] | null): string {
  if (!entries || entries.length === 0) return '';
  const lines: string[] = ['', '### Commit history (project git)', ''];
  for (const e of entries) {
    const hash = e.hash.slice(0, 7);
    lines.push(`- ${hash} ${e.date} ${e.authorName} — ${e.subject}`);
  }
  return lines.join('\n');
}

function formatBacklinks(backlinks: BacklinkEntry[] | null): string {
  if (!backlinks || backlinks.length === 0) return '';
  const lines: string[] = ['', `### Backlinks (${backlinks.length})`, ''];
  for (const b of backlinks) {
    const title = b.title ? ` — "${b.title}"` : '';
    const snippet = b.snippet ? ` — "${b.snippet}"` : '';
    lines.push(`- ${b.source}${title}${snippet}`);
  }
  return lines.join('\n');
}

function relativePath(input: string): string {
  return input.replace(/^\.\//, '').replace(/^\/+/, '');
}

export async function buildReadResult(
  args: { path: string; since?: string },
  deps: ReadDocumentDeps,
): Promise<string> {
  const relPath = relativePath(args.path);
  const abs = resolve(deps.projectDir, relPath);
  const historyDepth = deps.config.mcp.tools.read_document.historyDepth;

  const [content, meta] = await Promise.all([
    readFile(abs, 'utf-8'),
    enrichPath(
      relPath,
      { projectDir: deps.projectDir, serverUrl: deps.serverUrl, historyDepth },
      { includeRichFields: true },
    ),
  ]);

  const basename =
    relPath
      .split('/')
      .pop()
      ?.replace(/\.md$/, '')
      .replace(/\.mdx$/, '') ?? relPath;
  const title = meta.title ?? basename;
  const description = meta.description ?? '';
  const tags = meta.tags;

  const lines: string[] = [];
  lines.push(`## ${title}`);
  if (description) lines.push(`**Description:** ${description}`);
  if (tags.length > 0) lines.push(`**Tags:** ${tags.join(', ')}`);
  lines.push(`**Path:** ${relPath}`);

  const shadowSection = formatShadowHistory(meta.history);
  if (shadowSection) lines.push(shadowSection);

  const projectSection = formatProjectHistory(meta.projectHistory);
  if (projectSection) lines.push(projectSection);

  const backlinksSection = formatBacklinks(meta.backlinks);
  if (backlinksSection) lines.push(backlinksSection);

  lines.push('', '### Content', '', content);
  return lines.join('\n');
}

export function register(server: ServerInstance, deps: ReadDocumentDeps): void {
  server.tool(
    'read_document',
    DESCRIPTION,
    {
      path: z.string().describe('Project-root-relative path to the file'),
      since: z.string().optional().describe('Reserved; currently unused (§15 Future Work)'),
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
