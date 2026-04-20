/**
 * `rename_document` MCP tool — managed page rename via the server API.
 *
 * Calls POST /api/rename, which renames the target document and rewrites
 * inbound wiki-links plus supported internal inline Markdown links.
 */
import { z } from 'zod';
import { type PreviewUrlSource, resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  normalizeDocName,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

export interface RenameDocumentMapping {
  fromDocName: string;
  toDocName: string;
}

export interface RenameDocumentRewrittenDoc {
  docName: string;
  rewrites: number;
}

export interface RenameDocumentSuccess {
  ok: true;
  renamed: RenameDocumentMapping[];
  rewrittenDocs: RenameDocumentRewrittenDoc[];
  /** Preview URL for the NEW (renamed-to) docName. Null when UI is down. */
  previewUrl: string | null;
  /** Source of the previewUrl resolver (env / lock / config). Omitted when previewUrl is null. */
  previewUrlSource?: PreviewUrlSource;
  /** Preview URL that used to resolve to the now-renamed doc. Present only when the helper resolves. */
  previousPreviewUrl?: string;
}

export interface RenameDocumentError {
  ok: false;
  error: string;
}

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Rename a document through the managed rename flow at `POST /api/rename`.',
  'Renames the target document and rewrites inbound wiki-links plus supported internal inline Markdown links in affected docs.',
  '',
  '**Parameters:**',
  '- `docName` — Current document name, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `newDocName` — New document name, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
].join('\n');

function parseRenameMappings(value: unknown): RenameDocumentMapping[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { fromDocName, toDocName } = entry as Record<string, unknown>;
    return typeof fromDocName === 'string' && typeof toDocName === 'string'
      ? [{ fromDocName, toDocName }]
      : [];
  });
}

function parseRewrittenDocs(value: unknown): RenameDocumentRewrittenDoc[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const { docName, rewrites } = entry as Record<string, unknown>;
    return typeof docName === 'string' && typeof rewrites === 'number'
      ? [{ docName, rewrites }]
      : [];
  });
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export interface RenameDocumentDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

export function register(server: ServerInstance, deps: RenameDocumentDeps): void {
  server.tool(
    'rename_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Current document name'),
      newDocName: z.string().describe('New document name'),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: { docName: string; newDocName: string; cwd?: string }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalizedDoc = normalizeDocName(args.docName);
      if (!normalizedDoc.ok) return textResult(normalizedDoc.error, true);
      const normalizedNewDoc = normalizeDocName(args.newDocName);
      if (!normalizedNewDoc.ok) return textResult(normalizedNewDoc.error, true);

      const result = await httpPost(url, '/api/rename', {
        docName: normalizedDoc.docName,
        newDocName: normalizedNewDoc.docName,
      });

      if (!result.ok) {
        const error = typeof result.error === 'string' ? result.error : 'Rename failed';
        const structured: RenameDocumentError = { ok: false, error };
        return textPlusStructured(`Error: ${error}`, structured, true);
      }

      const renamed = parseRenameMappings(result.renamed);
      const rewrittenDocs = parseRewrittenDocs(result.rewrittenDocs);
      const renamedSummary =
        renamed.map(({ fromDocName, toDocName }) => `${fromDocName} -> ${toDocName}`).join(', ') ||
        `${normalizedDoc.docName} -> ${normalizedNewDoc.docName}`;
      const rewrittenSummary =
        rewrittenDocs.length === 0
          ? 'No inbound links required updates.'
          : `Rewrote ${rewrittenDocs.length} ${pluralize(rewrittenDocs.length, 'document')}.`;

      // previewUrl points at the NEW docName (the renamed-to target) per FR-2.1;
      // previousPreviewUrl is supplementary for agents that want to close/refocus
      // the pre-rename tab.
      const previewDeps = { config: deps.config, resolveCwd: deps.resolveCwd };
      const newPreview = await resolvePreviewUrlForTool(normalizedNewDoc.docName, previewDeps, cwd);
      const oldPreview = await resolvePreviewUrlForTool(normalizedDoc.docName, previewDeps, cwd);

      const structured: RenameDocumentSuccess = {
        ok: true,
        renamed,
        rewrittenDocs,
        previewUrl: newPreview?.url ?? null,
        ...(newPreview ? { previewUrlSource: newPreview.source } : {}),
        ...(oldPreview ? { previousPreviewUrl: oldPreview.url } : {}),
      };

      return textPlusStructured(`Renamed ${renamedSummary}. ${rewrittenSummary}`, structured);
    },
  );
}
