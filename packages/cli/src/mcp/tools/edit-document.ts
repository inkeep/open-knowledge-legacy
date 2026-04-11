/**
 * `edit_document` MCP tool — targeted find-and-replace on live document content.
 *
 * Sends a patch to Hocuspocus via POST /api/agent-patch, which finds the text
 * in the Y.Text and replaces it, propagating to all connected editors.
 */
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpPost, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find-and-replace on a live document via the CRDT layer.',
  'The patch is applied through Hocuspocus and propagated to all connected editors in real-time.',
  '',
  '**Parameters:**',
  '- `docName` — Document name to edit',
  '- `find` — Text to find (exact match)',
  '- `replace` — Replacement text',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'edit_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to edit'),
      find: z.string().describe('Text to find (exact match)'),
      replace: z.string().describe('Replacement text'),
    },
    async (args: { docName: string; find: string; replace: string }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const result = await httpPost(serverUrl, '/api/agent-patch', {
        docName: args.docName,
        find: args.find,
        replace: args.replace,
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult('Edit applied successfully');
    },
  );
}
