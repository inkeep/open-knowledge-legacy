/**
 * `rollback_to_version` MCP tool — restore a document to a historical version.
 *
 * Reads historical content from the shadow repo and applies it to the live
 * Y.Doc via POST /api/rollback, creating a new CRDT transaction (append-only).
 * All connected editors see the restored content.
 */
import { z } from 'zod';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpGet, httpPost, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Restore a document to a historical version via the CRDT layer.',
  'The restore is append-only — it creates a new version with the old content,',
  'preserving all history. All connected editors see the change in real-time.',
  '',
  '**Parameters:**',
  '- `docName` — Document name to restore',
  '- `commitSha` — The 40-character SHA of the shadow repo commit to restore to.',
  '  Use `list_documents` + GET /api/history to find available versions.',
].join('\n');

export function register(server: ServerInstance, serverUrl: string | undefined): void {
  server.tool(
    'rollback_to_version',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to restore'),
      commitSha: z
        .string()
        .length(40)
        .regex(/^[0-9a-f]+$/i)
        .describe('40-character commit SHA from the shadow repo timeline'),
    },
    async (args: { docName: string; commitSha: string }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      // First, verify the version exists and show what we're restoring
      const versionResult = await httpGet(
        serverUrl,
        `/api/history/${args.commitSha}?docName=${encodeURIComponent(args.docName)}`,
      );
      if (!versionResult.ok) {
        return textResult(`Error: ${versionResult.error ?? 'Version not found'}`, true);
      }

      // Perform the rollback
      const result = await httpPost(serverUrl, '/api/rollback', {
        docName: args.docName,
        commitSha: args.commitSha,
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      return textResult(
        `Restored "${args.docName}" to version ${args.commitSha.slice(0, 8)} (${versionResult.author}, ${versionResult.timestamp}). The change has been applied to all connected editors.`,
      );
    },
  );
}
