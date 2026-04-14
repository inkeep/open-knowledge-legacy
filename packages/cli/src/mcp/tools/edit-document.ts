/**
 * `edit_document` MCP tool — targeted find-and-replace on live document content.
 *
 * Sends a patch to Hocuspocus via POST /api/agent-patch, which finds the text
 * in the Y.Text and replaces it, propagating to all connected editors.
 */
import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import type { ServerInstance } from './shared.ts';
import { HOCUSPOCUS_NOT_RUNNING_ERROR, httpPost, normalizeDocName, textResult } from './shared.ts';

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Find-and-replace on a live document via the CRDT layer.',
  'The patch is applied through Hocuspocus and propagated to all connected editors in real-time.',
  'Use `offset` when you need to patch an exact occurrence; omit it to preserve first-match behavior.',
  '',
  '**When rewriting prose, add `[[wiki-links]]` aggressively.** If the replacement mentions other documents or entities that should have their own page, link them as `[[Page Name]]`. Over-linking is the goal; underlinked documents lose their value in backlink-driven navigation.',
  '',
  '**Parameters:**',
  '- `docName` — Document name, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `find` — Text to find (exact match)',
  '- `replace` — Replacement text',
  '- `offset` (optional) — Exact occurrence to patch, as a JavaScript string offset in the current markdown. If the document changed and the text no longer matches there, the server returns a stale-target error; re-run `suggest_links` to get fresh offsets.',
].join('\n');

export function register(
  server: ServerInstance,
  serverUrl: string | undefined,
  identityRef?: { current: AgentIdentity },
): void {
  server.tool(
    'edit_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to edit'),
      find: z.string().describe('Text to find (exact match)'),
      replace: z.string().describe('Replacement text'),
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          'Exact occurrence to patch, as a JavaScript string offset in the current markdown',
        ),
    },
    async (args: { docName: string; find: string; replace: string; offset?: number }) => {
      if (!serverUrl) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);
      const normalized = normalizeDocName(args.docName);
      if (!normalized.ok) return textResult(normalized.error, true);
      const identity = identityRef?.current;
      const result = await httpPost(serverUrl, '/api/agent-patch', {
        docName: normalized.docName,
        find: args.find,
        replace: args.replace,
        offset: args.offset,
        ...(identity
          ? {
              agentId: identity.connectionId,
              agentName: identity.displayName,
              clientName: identity.clientInfo?.name,
            }
          : {}),
      });
      if (!result.ok) return textResult(`Error: ${result.error}`, true);
      return textResult('Edit applied successfully');
    },
  );
}
