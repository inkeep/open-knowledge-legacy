/**
 * `rename_document` MCP tool — managed page rename via the server API.
 *
 * Calls POST /api/rename, which renames the target document and rewrites
 * inbound wiki-links plus supported internal inline Markdown links.
 */
import { z } from 'zod';
import type { ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
  normalizeDocName,
  resolveServerUrl,
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

export function register(server: ServerInstance, serverUrl: ServerUrlOrResolver): void {
  server.tool(
    'rename_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Current document name'),
      newDocName: z.string().describe('New document name'),
    },
    async (args: { docName: string; newDocName: string }) => {
      const url = await resolveServerUrl(serverUrl);
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

      const structured: RenameDocumentSuccess = {
        ok: true,
        renamed,
        rewrittenDocs,
      };

      return textPlusStructured(`Renamed ${renamedSummary}. ${rewrittenSummary}`, structured);
    },
  );
}
