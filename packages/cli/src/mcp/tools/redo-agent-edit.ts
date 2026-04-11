/**
 * `redo_agent_edit` MCP tool — redo the last undone agent edit on a document.
 *
 * Re-applies the most recently undone agent edit. Uses per-document
 * UndoManager via POST /api/agent-redo.
 */
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpPost, textResult } from './shared.ts';

export const DESCRIPTION = [
  'Redo the last undone agent edit on a document.',
  'Re-applies the most recently undone agent edit (origin: agent-write).',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'redo_agent_edit',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to redo on'),
    },
    async (args: { docName: string }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const result = await httpPost(serverUrl, '/api/agent-redo', {
        docName: args.docName,
      });
      if (!result.ok)
        return textResult(
          `Cannot redo. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`,
          true,
        );
      return textResult(`Redo performed. canUndo: ${result.canUndo}, canRedo: ${result.canRedo}`);
    },
  );
}
