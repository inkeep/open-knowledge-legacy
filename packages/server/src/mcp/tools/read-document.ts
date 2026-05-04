import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { BacklinkEntry, ForwardLinkEntry, GitCommit } from '../../content/enrichment.ts';
import { enrichPath } from '../../content/enrichment.ts';
import type { ShadowCommit } from '../../content/shadow-log.ts';
import { resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import { resolveProjectServerContext, textPlusStructured, textResult } from './shared.ts';

export const DESCRIPTION = [
  'Read a wiki file with enriched context: contents + frontmatter metadata + recent shadow-repo activity (agent vs human attribution) + backlink/forward-link context.',
  '',
  '**Use when:**',
  '- Loading an article for context',
  '- Understanding who changed a file recently and whether it was an agent or human',
  '- Seeing how this page links out and what links back to it',
  '',
  '**When the project has `.ok/`**, strongly prefer this over your native `Read` for wiki files — one call returns what otherwise takes 3-4. In projects without `.ok/`, use native `Read` as usual.',
  '',
  '**Parameters:**',
  '- `path` — Project-root-relative path to the file, including extension (e.g. `articles/auth/sso.md`). To pass this document to `edit_document` / `write_document` / `get_backlinks`, strip the extension (they take extension-less `docName`).',
  '- `since` (reserved) — Reserved for shadow-log since-filter; currently unused.',
].join('\n');

export interface ReadDocumentDeps {
  resolveCwd: (explicit?: string) => Promise<string>;
  config: ConfigOrResolver;
  serverUrl: ServerUrlOrResolver;
}

function formatShadowHistory(entries: ShadowCommit[] | null): string {
  if (!entries || entries.length === 0) return '';
  const lines: string[] = ['', '### Recent activity (OK edits)', ''];
  for (const e of entries) {
    const who =
      e.writerClassification === 'agent'
        ? `agent: ${e.writerName}`
        : e.writerClassification === 'principal'
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

function formatForwardLinks(forwardLinks: ForwardLinkEntry[] | null): string {
  if (!forwardLinks || forwardLinks.length === 0) return '';
  const lines: string[] = ['', `### Forward links (${forwardLinks.length})`, ''];
  for (const link of forwardLinks) {
    if (link.kind === 'external') {
      const title = link.title ? ` — "${link.title}"` : '';
      const snippet = link.snippet ? ` — "${link.snippet}"` : '';
      lines.push(`- ${link.url}${title}${snippet}`);
      continue;
    }
    const title = link.title ? ` — "${link.title}"` : '';
    const snippet = link.snippet ? ` — "${link.snippet}"` : '';
    lines.push(`- ${link.docName}${title}${snippet}`);
  }
  return lines.join('\n');
}

function relativePath(input: string): string {
  return input.replace(/^\.\//, '').replace(/^\/+/, '');
}

function docNameFromRelPath(relPath: string): string {
  return relPath.replace(/\.(md|mdx)$/i, '');
}

export async function buildReadResult(
  args: { path: string; since?: string; cwd?: string },
  deps: ReadDocumentDeps,
): Promise<string> {
  const context = await resolveProjectServerContext(
    deps.resolveCwd,
    deps.config,
    deps.serverUrl,
    args.cwd,
  );
  if (!context.ok) {
    throw new Error(context.error);
  }
  const { cwd, config, url: resolvedServerUrl } = context;
  const relPath = relativePath(args.path);
  const abs = resolve(cwd, relPath);
  const historyDepth = config.mcp.tools.read_document.historyDepth;

  const [content, meta] = await Promise.all([
    readFile(abs, 'utf-8'),
    enrichPath(
      relPath,
      {
        projectDir: cwd,
        serverUrl: resolvedServerUrl,
        historyDepth,
        folderRules: config.folders,
      },
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

  const forwardLinksSection = formatForwardLinks(meta.forwardLinks);
  if (forwardLinksSection) lines.push(forwardLinksSection);

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
      cwd: z
        .string()
        .optional()
        .describe(
          'Absolute host path to resolve `path` against. Defaults only when the MCP client advertises exactly one root; otherwise pass `cwd` explicitly.',
        ),
    },
    async (args: { path: string; since?: string; cwd?: string }) => {
      try {
        const body = await buildReadResult(args, deps);
        const docName = docNameFromRelPath(relativePath(args.path));
        const preview = await resolvePreviewUrlForTool(
          docName,
          {
            config: deps.config,
            resolveCwd: deps.resolveCwd,
          },
          await deps.resolveCwd(args.cwd),
        );
        if (!preview) {
          return textPlusStructured(body, { previewUrl: null });
        }
        return textPlusStructured(body, {
          previewUrl: preview.url,
          previewUrlSource: preview.source,
        });
      } catch (err) {
        return textResult(`Error: ${err instanceof Error ? err.message : String(err)}`, true);
      }
    },
  );
}
