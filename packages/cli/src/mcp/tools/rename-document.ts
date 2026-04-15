/**
 * `rename_document` MCP tool — managed page rename via the server API.
 *
 * Calls POST /api/rename, which renames the target document and rewrites
 * inbound wiki-links plus supported internal inline Markdown links.
 */
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpPost,
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
  '- `docName` — Current document name',
  '- `newDocName` — New document name',
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

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'rename_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Current document name'),
      newDocName: z.string().describe('New document name'),
    },
    async (args: { docName: string; newDocName: string }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const result = await httpPost(serverUrl, '/api/rename', {
        docName: args.docName,
        newDocName: args.newDocName,
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
        `${args.docName} -> ${args.newDocName}`;
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
