/**
 * `list_documents` MCP tool — list available documents from Hocuspocus.
 *
 * Calls GET /api/documents (from the parallel document-list-api spec).
 * Returns the document list as JSON text.
 */
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpGet, textResult } from './shared.ts';

export const DESCRIPTION = [
  'List available documents from the Hocuspocus server.',
  'Returns document names, optionally filtered by directory.',
  '',
  '**Parameters:**',
  '- `dir` (optional) — Filter to documents in this directory',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'list_documents',
    DESCRIPTION,
    {
      dir: z.string().optional().describe('Optional directory to filter documents'),
    },
    async (args: { dir?: string }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const query = args.dir ? `?dir=${encodeURIComponent(args.dir)}` : '';
      const result = await httpGet(serverUrl, `/api/documents${query}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      const { ok: _ok, ...data } = result;
      return textResult(JSON.stringify(data, null, 2));
    },
  );
}
