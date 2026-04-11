/**
 * `undo_agent_edit` MCP tool — undo the last agent edit on a document.
 *
 * Only agent edits (origin: agent-write) are reversed. Human edits are not
 * affected. Uses per-document UndoManager via POST /api/agent-undo.
 */
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpPost, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Undo the last agent edit on a document.',
  'Only agent edits (origin: agent-write) are reversed — human edits are not affected.',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'undo_agent_edit',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to undo on'),
    },
    async (args: { docName: string }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const result = await httpPost(serverUrl, '/api/agent-undo', {
        docName: args.docName,
      });
      if (!result.ok)
        return textResult(
          `Cannot undo. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`,
          true,
        );
      return textResult(`Undo performed. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`);
    },
  );
}
