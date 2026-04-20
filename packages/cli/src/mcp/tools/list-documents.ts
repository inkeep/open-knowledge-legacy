/**
 * `list_documents` MCP tool — list available documents from Hocuspocus.
 *
 * Calls GET /api/documents (from the parallel document-list-api spec).
 * Returns the document list as JSON text plus structuredContent with per-row
 * previewUrl (FR-2.2) and a top-level `ui` block (FR-2.6).
 */
import { z } from 'zod';
import { buildListResolver, type PreviewUrlDeps } from './preview-url.ts';
import type { ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  resolveServerUrl,
  textPlusStructured,
  textResult,
} from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] List available documents from the Hocuspocus server.',
  'Returns document names, optionally filtered by directory.',
  '',
  '**Parameters:**',
  '- `dir` (optional) — Filter to documents in this directory',
].join('\n');

interface DocumentsPayload {
  documents?: Array<Record<string, unknown> & { docName?: string }>;
}

export interface ListDocumentsDeps extends PreviewUrlDeps {
  serverUrl: ServerUrlOrResolver;
}

export function register(server: ServerInstance, deps: ListDocumentsDeps): void {
  server.tool(
    'list_documents',
    DESCRIPTION,
    {
      dir: z.string().optional().describe('Optional directory to filter documents'),
    },
    async (args: { dir?: string }) => {
      const url = await resolveServerUrl(deps.serverUrl);
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const query = args.dir ? `?dir=${encodeURIComponent(args.dir)}` : '';
      const result = await httpGet(url, `/api/documents${query}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...rest } = result;
      const data = rest as DocumentsPayload;
      const { resolve, ui } = await buildListResolver(deps);
      const documents = (data.documents ?? []).map((row) => {
        const docName = typeof row.docName === 'string' ? row.docName : null;
        const resolved = docName ? resolve(docName) : null;
        return {
          ...row,
          previewUrl: resolved?.url ?? null,
          ...(resolved ? { previewUrlSource: resolved.source } : {}),
        };
      });
      const structured = { ...data, documents, ui };
      return textPlusStructured(JSON.stringify(structured, null, 2), structured);
    },
  );
}
