import { z } from 'zod';
import type { AgentIdentity } from '../agent-identity.ts';
import { resolvePreviewUrlForTool } from './preview-url.ts';
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

interface DeleteDocumentSuccess {
  ok: true;
  deletedDocNames: string[];
  /** Preview URL that used to resolve to the now-deleted doc. Lets agents
   *  close the stale preview tab. Mirrors `rename_document.previousPreviewUrl`. */
  previousPreviewUrl?: string;
}

interface DeleteDocumentError {
  ok: false;
  error: string;
}

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] Delete a document through the managed delete flow at `POST /api/delete-path` (kind: file).',
  'Closes all open agent sessions for the doc, unloads it from Hocuspocus, and removes the file from disk.',
  '',
  '**Parameters:**',
  '- `docName` — Document name, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '',
  '**Notes:**',
  '- Inbound wiki-links to the deleted doc become dead links (redlinks) — they are NOT rewritten. Call `get_backlinks({ docName: "your-doc" })` BEFORE deleting to see which docs link here, then update or remove those references first.',
  '- Deletion is irreversible from this tool. Use `save_version` beforehand if you may need to roll back.',
  '- The structured response includes `previousPreviewUrl` (when a preview source resolves) so agents can close any stale preview tab pointing at the deleted doc.',
  '',
  '**Errors:**',
  '- 400 — `docName` is not a valid relative content path.',
  '- 404 — document does not exist.',
].join('\n');

export interface DeleteDocumentDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
  /** Identity passthrough for attribution threading (FR-5, D42). The
   *  server-side handler calls `extractAgentIdentity(body)` even though it
   *  does not currently surface the agent in the response — keep the field
   *  so future timeline/audit work picks up MCP-driven deletes correctly. */
  identityRef?: { current: AgentIdentity };
}

function parseDeletedDocNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function register(server: ServerInstance, deps: DeleteDocumentDeps): void {
  server.tool(
    'delete_document',
    DESCRIPTION,
    {
      docName: z.string().describe('Document name to delete'),
      cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
    },
    async (args: { docName: string; cwd?: string }) => {
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

      const identity = deps.identityRef?.current;
      const result = await httpPost(url, '/api/delete-path', {
        kind: 'file',
        path: normalizedDoc.docName,
        ...(identity
          ? {
              agentId: identity.connectionId,
              agentName: identity.displayName,
              clientName: identity.clientInfo?.name,
              colorSeed: identity.colorSeed,
            }
          : {}),
      });

      if (!result.ok) {
        const error = result.error as string;
        const structured: DeleteDocumentError = { ok: false, error };
        return textPlusStructured(`Error: ${error}`, structured, true);
      }

      const deletedDocNames = parseDeletedDocNames(result.deletedDocNames);
      const previousPreview = await resolvePreviewUrlForTool(
        normalizedDoc.docName,
        { config: deps.config, resolveCwd: deps.resolveCwd },
        cwd,
      );
      const structured: DeleteDocumentSuccess = {
        ok: true,
        deletedDocNames: deletedDocNames.length > 0 ? deletedDocNames : [normalizedDoc.docName],
        ...(previousPreview ? { previousPreviewUrl: previousPreview.url } : {}),
      };

      const text =
        structured.deletedDocNames.length === 1
          ? `Deleted ${structured.deletedDocNames[0]}.`
          : `Deleted ${structured.deletedDocNames.length} documents: ${structured.deletedDocNames.join(', ')}.`;
      return textPlusStructured(text, structured);
    },
  );
}
